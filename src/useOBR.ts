import { useEffect, useRef, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import LZString from "lz-string";
import { blankCharacter, healCharacter, type Character } from "./types";
import { healRetainer, type Retainer } from "./retainerTypes";

// Legacy: the whole party as one array under a single key. Every edit rewrote
// all of it, so concurrent edits clobbered each other. Kept only to migrate.
export const LEGACY_KEY = "com.p4p.ose-character-sheet/roster";
// Current: one key per character, so an edit only touches that character.
export const CHAR_PREFIX = "com.p4p.ose-character-sheet/char/";
export const charKey = (id: string) => CHAR_PREFIX + id;
// Retainer cards: same per-item key scheme, own prefix.
export const RET_PREFIX = "com.p4p.ose-character-sheet/ret/";
export const retKey = (id: string) => RET_PREFIX + id;

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

interface Stored { id: string; createdAt: number; updatedAt: number }

// Storage format: id/createdAt/updatedAt stay readable (merging needs them);
// everything else is packed as LZ-compressed JSON containing only the fields
// that differ from a blank item. Unpacked (older) values are still read as-is.
const META = ["id", "createdAt", "updatedAt"] as const;

function pack<T extends Stored>(item: T, blank: T): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    if ((META as readonly string[]).includes(k)) continue;
    if (JSON.stringify(v) !== JSON.stringify((blank as Record<string, unknown>)[k])) diff[k] = v;
  }
  return { id: item.id, createdAt: item.createdAt, updatedAt: item.updatedAt, z: LZString.compressToBase64(JSON.stringify(diff)) };
}

function unpack(v: Record<string, unknown>): Record<string, unknown> {
  if (typeof v.z !== "string") return v;
  try {
    const diff = JSON.parse(LZString.decompressFromBase64(v.z) || "{}");
    return { ...diff, id: v.id, createdAt: v.createdAt, updatedAt: v.updatedAt };
  } catch {
    return { id: v.id, createdAt: v.createdAt, updatedAt: v.updatedAt };
  }
}

export const packCharacter = (c: Character) => pack(c, blankCharacter(c.id, "unknown"));
export const packRetainer = (r: Retainer) => pack(r, healRetainer({ id: r.id }));

function readItems<T extends Stored>(metadata: Record<string, unknown>, prefix: string, heal: (raw: Partial<T> & { id: string }) => T, sort: (a: T, b: T) => number): T[] {
  const out: T[] = [];
  for (const [k, v] of Object.entries(metadata)) {
    if (!k.startsWith(prefix) || !v || typeof v !== "object") continue;
    if ((v as { deleted?: boolean }).deleted) continue; // tombstone
    out.push(heal(unpack(v as Record<string, unknown>) as Partial<T> & { id: string }));
  }
  return out.sort(sort);
}

const byCreated = (a: Stored, b: Stored) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);
const byOrder = (a: Retainer, b: Retainer) => a.order - b.order || byCreated(a, b);

export const readRoster = (metadata: Record<string, unknown>): Character[] =>
  readItems<Character>(metadata, CHAR_PREFIX, healCharacter, byCreated);
export const readRetainers = (metadata: Record<string, unknown>): Retainer[] =>
  readItems<Retainer>(metadata, RET_PREFIX, healRetainer, byOrder);

// One-time move from the legacy single-array key to per-character keys.
// Only writes characters that don't already have a key, re-reading the room
// first, so it can never overwrite newer per-character edits.
export async function migrateLegacy() {
  const metadata = await OBR.room.getMetadata();
  const legacy = metadata[LEGACY_KEY];
  if (!Array.isArray(legacy)) return;
  const update: Record<string, unknown> = { [LEGACY_KEY]: undefined };
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

// Deleted items leave a tiny tombstone rather than relying on a key being
// removed, so a delete reliably reaches every client and a stale echo can't
// bring the item back.
function readTombstones(metadata: Record<string, unknown>, prefix: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, v] of Object.entries(metadata)) {
    if (!k.startsWith(prefix) || !v || typeof v !== "object") continue;
    const t = v as { deleted?: boolean; id?: string; updatedAt?: number };
    if (t.deleted && t.id) out.set(t.id, t.updatedAt ?? 0);
  }
  return out;
}

/**
 * A list of items kept in room metadata, one key per item. Edits only touch
 * that item's key, and the newest updatedAt wins, so two people editing
 * different items (or the same one at different moments) never overwrite
 * each other.
 */
function useSyncedList<T extends Stored>(opts: {
  prefix: string;
  heal: (raw: Partial<T> & { id: string }) => T;
  sort: (a: T, b: T) => number;
  migrate?: () => Promise<void>;
  fullWarning: string;
  stripOnFull?: (item: T) => T | null;
  pack: (item: T) => Record<string, unknown>;
}) {
  const { prefix, heal, sort, fullWarning } = opts;
  const [items, setItems] = useState<T[] | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  // Latest local version of every item, including edits whose write hasn't
  // been echoed back yet. An incoming room value only replaces a local one if
  // it's strictly newer (updatedAt), so a late echo can't revert a fresh edit.
  const localRef = useRef<Map<string, T>>(new Map());
  const deletedRef = useRef<Set<string>>(new Set());
  const unseenRef = useRef<Set<string>>(new Set()); // created here, not yet seen in the room
  const key = (id: string) => prefix + id;

  const publish = () => setItems([...localRef.current.values()].sort(sort));

  const merge = (metadata: Record<string, unknown>) => {
    const incoming = readItems<T>(metadata, prefix, heal, sort);
    const seen = new Set<string>();
    for (const [id, at] of readTombstones(metadata, prefix)) {
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
      try { await opts.migrate?.(); } catch { /* retry next load */ }
      merge(await OBR.room.getMetadata());
      unsubscribe = OBR.room.onMetadataChange((metadata) => merge(metadata));
    });
    return () => unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const write = async (batch: T[]): Promise<boolean> => {
    const update: Record<string, unknown> = {};
    for (const it of batch) update[key(it.id)] = opts.pack(it);
    try {
      await OBR.room.setMetadata(update);
      setSaveWarning(null);
      return true;
    } catch {
      // Room metadata is capped (16kB total, shared by every extension in
      // the room). Retry with the largest optional field stripped.
      if (batch.length === 1 && opts.stripOnFull) {
        const stripped = opts.stripOnFull(batch[0]);
        if (stripped) {
          try {
            await OBR.room.setMetadata({ [key(stripped.id)]: opts.pack(stripped) });
            localRef.current.set(stripped.id, stripped);
            publish();
            setSaveWarning("Room storage is full, so manually-uploaded portraits couldn't be saved. Assign a token to a character instead for a portrait that persists.");
            return true;
          } catch { /* fall through */ }
        }
      }
      setSaveWarning(fullWarning);
      return false;
    }
  };

  const stamp = (next: T): T => {
    const prev = localRef.current.get(next.id);
    return { ...next, updatedAt: Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1) };
  };

  const save = (next: T, isNew = false) => {
    const stamped = stamp(next);
    localRef.current.set(stamped.id, stamped);
    if (isNew) unseenRef.current.add(stamped.id);
    publish();
    return write([stamped]).then((ok) => {
      // A brand-new item that couldn't be stored must not linger on screen as if it were saved.
      if (!ok && isNew) {
        localRef.current.delete(stamped.id);
        unseenRef.current.delete(stamped.id);
        publish();
      }
    });
  };

  // Several items in one room write (e.g. reordering).
  const saveMany = (nexts: T[]) => {
    const stamped = nexts.map(stamp);
    for (const s of stamped) localRef.current.set(s.id, s);
    publish();
    return write(stamped);
  };

  const remove = async (id: string) => {
    deletedRef.current.add(id);
    localRef.current.delete(id);
    unseenRef.current.delete(id);
    publish();
    try {
      // undefined removes the key outright (null would leave the key behind, still costing space).
      await OBR.room.setMetadata({ [key(id)]: undefined });
    } catch {
      setSaveWarning("Couldn't delete - try again.");
    }
  };

  return { items, save, saveMany, remove, saveWarning };
}

export function useRoster() {
  const r = useSyncedList<Character>({
    prefix: CHAR_PREFIX,
    heal: healCharacter,
    sort: byCreated,
    migrate: migrateLegacy,
    fullWarning: "NOT SAVED - room storage is full. Changes will be lost on refresh. Remove a portrait or trim notes.",
    pack: packCharacter,
    stripOnFull: (c) => (c.portrait && !c.linkedTokenId ? { ...c, portrait: null } : null),
  });
  return { roster: r.items, saveCharacter: r.save, deleteCharacter: r.remove, saveWarning: r.saveWarning };
}

export function useRetainers() {
  const r = useSyncedList<Retainer>({
    prefix: RET_PREFIX,
    heal: healRetainer,
    sort: byOrder,
    pack: packRetainer,
    fullWarning: "NOT SAVED - room storage is full. Remove a retainer or a portrait.",
  });
  return { retainers: r.items, saveRetainer: r.save, saveRetainers: r.saveMany, deleteRetainer: r.remove, retainerWarning: r.saveWarning };
}

/** Bytes of room metadata in use (Owlbear caps it at 16 kB, shared by every extension). */
export const ROOM_LIMIT = 16384;
export interface RoomUsage { total: number; sheets: number; retainers: number; deleted: number; legacy: number; other: number; perItem: Record<string, number> }
const bytesOf = (v: unknown) => new TextEncoder().encode(JSON.stringify(v) ?? "").length;
export function measureRoom(m: Record<string, unknown>): RoomUsage {
  const u: RoomUsage = { total: 0, sheets: 0, retainers: 0, deleted: 0, legacy: 0, other: 0, perItem: {} };
  for (const [k, v] of Object.entries(m)) {
    const n = k.length + bytesOf(v) + 6;
    u.total += n;
    const tomb = !!v && typeof v === "object" && (v as { deleted?: boolean }).deleted;
    if (tomb || v === null) u.deleted += n;
    else if (k === LEGACY_KEY) u.legacy += n;
    else if (k.startsWith(CHAR_PREFIX)) { u.sheets += n; u.perItem[k.slice(CHAR_PREFIX.length)] = n; }
    else if (k.startsWith(RET_PREFIX)) u.retainers += n;
    else u.other += n;
  }
  return u;
}
export function useRoomUsage() {
  const [usage, setUsage] = useState<RoomUsage | null>(null);
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    OBR.onReady(async () => {
      setUsage(measureRoom(await OBR.room.getMetadata()));
      unsubscribe = OBR.room.onMetadataChange((m) => setUsage(measureRoom(m)));
    });
    return () => unsubscribe?.();
  }, []);
  return usage;
}

/** GM, once per load: pack any still-unpacked items in place (same content and timestamps). */
export async function repackRoom() {
  const m = await OBR.room.getMetadata();
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) {
    if (v === null && (k === LEGACY_KEY || k.startsWith(CHAR_PREFIX) || k.startsWith(RET_PREFIX))) { update[k] = undefined; continue; } // leftover empty keys
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    if (o.deleted && (k.startsWith(CHAR_PREFIX) || k.startsWith(RET_PREFIX))) { update[k] = undefined; continue; } // sweep tombstones
    if (o.deleted || typeof o.z === "string" || typeof o.id !== "string") continue;
    if (k.startsWith(CHAR_PREFIX)) update[k] = packCharacter(healCharacter(o as Partial<Character> & { id: string }));
    else if (k.startsWith(RET_PREFIX)) update[k] = packRetainer(healRetainer(o as Partial<Retainer> & { id: string }));
  }
  if (Array.isArray(m[LEGACY_KEY]) && (m[LEGACY_KEY] as unknown[]).length === 0) update[LEGACY_KEY] = undefined;
  if (Object.keys(update).length) await OBR.room.setMetadata(update);
}
