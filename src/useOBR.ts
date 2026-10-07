import { useEffect, useRef, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { healCharacter, type Character } from "./types";

// Legacy: the whole party as one array under a single key. Every edit rewrote
// all of it, so concurrent edits clobbered each other. Kept only to migrate.
export const LEGACY_KEY = "com.p4p.ose-character-sheet/roster";
// Current: one key per character, so an edit only touches that character.
export const CHAR_PREFIX = "com.p4p.ose-character-sheet/char/";
export const charKey = (id: string) => CHAR_PREFIX + id;

export interface PlayerInfo {
  id: string;
  name: string;
  role: "GM" | "PLAYER";
}

export function usePlayer() {
  const [player, setPlayer] = useState<PlayerInfo | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    OBR.onReady(async () => {
      const [id, name, role] = await Promise.all([
        Promise.resolve(OBR.player.id),
        OBR.player.getName(),
        OBR.player.getRole(),
      ]);
      setPlayer({ id, name, role });
      unsubscribe = OBR.player.onChange((p) => setPlayer({ id: p.id, name: p.name, role: p.role }));
    });
    return () => unsubscribe?.();
  }, []);

  return player;
}

export function readRoster(metadata: Record<string, unknown>): Character[] {
  const out: Character[] = [];
  for (const [k, v] of Object.entries(metadata)) {
    if (!k.startsWith(CHAR_PREFIX) || !v || typeof v !== "object") continue;
    if ((v as { deleted?: boolean }).deleted) continue; // tombstone
    out.push(healCharacter(v as Partial<Character> & { id: string }));
  }
  return out.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

// One-time move from the legacy single-array key to per-character keys.
// Only writes characters that don't already have a key, re-reading the room
// first, so it can never overwrite newer per-character edits.
export async function migrateLegacy() {
  const metadata = await OBR.room.getMetadata();
  const legacy = metadata[LEGACY_KEY];
  if (!Array.isArray(legacy)) return;
  const update: Record<string, unknown> = { [LEGACY_KEY]: null };
  (legacy as (Partial<Character> & { id: string })[]).forEach((raw, i) => {
    if (!raw?.id || metadata[charKey(raw.id)]) return;
    update[charKey(raw.id)] = { ...raw, createdAt: raw.createdAt ?? i, updatedAt: raw.updatedAt ?? 1 };
  });
  await OBR.room.setMetadata(update);
  // If this SDK build doesn't delete a key set to null, empty the old array
  // instead so it stops eating the room's 16kB budget.
  const after = await OBR.room.getMetadata();
  if (Array.isArray(after[LEGACY_KEY]) && (after[LEGACY_KEY] as unknown[]).length) {
    await OBR.room.setMetadata({ [LEGACY_KEY]: [] });
  }
}

// Deleted characters leave a tiny tombstone rather than relying on a key
// being removed, so a delete reliably reaches every client and a stale
// echo can't bring the character back.
function readTombstones(metadata: Record<string, unknown>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, v] of Object.entries(metadata)) {
    if (!k.startsWith(CHAR_PREFIX) || !v || typeof v !== "object") continue;
    const t = v as { deleted?: boolean; id?: string; updatedAt?: number };
    if (t.deleted && t.id) out.set(t.id, t.updatedAt ?? 0);
  }
  return out;
}

export function useRoster() {
  const [roster, setRoster] = useState<Character[] | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  // Latest local version of every character, including edits whose write
  // hasn't been echoed back yet. An incoming room value only replaces a
  // local one if it's strictly newer (updatedAt), so a late echo of an older
  // write can never revert what was just typed.
  const localRef = useRef<Map<string, Character>>(new Map());
  const deletedRef = useRef<Set<string>>(new Set());
  const unseenRef = useRef<Set<string>>(new Set()); // created here, not yet seen in the room

  const publish = () =>
    setRoster([...localRef.current.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)));

  const merge = (metadata: Record<string, unknown>) => {
    const incoming = readRoster(metadata);
    const seen = new Set<string>();
    for (const [id, at] of readTombstones(metadata)) {
      const local = localRef.current.get(id);
      if (local && at >= local.updatedAt) localRef.current.delete(id);
      deletedRef.current.add(id);
      unseenRef.current.delete(id);
    }
    for (const c of incoming) {
      if (deletedRef.current.has(c.id)) continue;
      seen.add(c.id);
      unseenRef.current.delete(c.id);
      const local = localRef.current.get(c.id);
      if (!local || c.updatedAt > local.updatedAt) localRef.current.set(c.id, c);
    }
    // Removed in the room by someone else (unless it's ours and still in flight).
    for (const id of [...localRef.current.keys()]) {
      if (!seen.has(id) && !unseenRef.current.has(id)) localRef.current.delete(id);
    }
    publish();
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    OBR.onReady(async () => {
      try { await migrateLegacy(); } catch { /* retry next load */ }
      merge(await OBR.room.getMetadata());
      unsubscribe = OBR.room.onMetadataChange((metadata) => merge(metadata));
    });
    return () => unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const write = async (c: Character) => {
    try {
      await OBR.room.setMetadata({ [charKey(c.id)]: c });
      setSaveWarning(null);
    } catch {
      // Room metadata is capped (16kB total, shared by every extension in
      // the room). Retry without a manually-uploaded portrait, which is by
      // far the largest field.
      if (c.portrait && !c.linkedTokenId) {
        const stripped = { ...c, portrait: null };
        try {
          await OBR.room.setMetadata({ [charKey(c.id)]: stripped });
          localRef.current.set(c.id, stripped);
          publish();
          setSaveWarning("Room storage is full, so manually-uploaded portraits couldn't be saved. Assign a token to a character instead for a portrait that persists.");
          return;
        } catch { /* fall through */ }
      }
      setSaveWarning("NOT SAVED - room storage is full. Changes will be lost on refresh. Remove a portrait or trim notes.");
    }
  };

  const saveCharacter = (next: Character, isNew = false) => {
    const prev = localRef.current.get(next.id);
    const stamped = { ...next, updatedAt: Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1) };
    localRef.current.set(stamped.id, stamped);
    if (isNew) unseenRef.current.add(stamped.id);
    publish();
    return write(stamped);
  };

  const deleteCharacter = async (id: string) => {
    deletedRef.current.add(id);
    localRef.current.delete(id);
    unseenRef.current.delete(id);
    publish();
    try {
      await OBR.room.setMetadata({ [charKey(id)]: { id, deleted: true, updatedAt: Date.now() } });
    } catch {
      setSaveWarning("Couldn't delete - try again.");
    }
  };

  return { roster, saveCharacter, deleteCharacter, saveWarning };
}
