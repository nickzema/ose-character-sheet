import { useEffect, useRef, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import type { Character } from "./types";
import { syncLinkedToken } from "./statBubbles";
import {
  CHAR_PREFIX,
  INDEX_KEY,
  composeRoster,
  mergeInto,
  migrateLegacyRoster,
  nextRev,
  parseIndex,
  type StoredCharacter,
  type StoredIndex,
} from "./rosterStore";

// Keystroke-level edits (typing a name, notes, inventory items) are held
// locally and written to the room after a short pause, so typing a sentence
// is one room write instead of one per keypress. Adding, deleting, and GM
// visibility toggles still save immediately.
const EDIT_DEBOUNCE_MS = 400;

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

export function useRoster() {
  const [roster, setRoster] = useState<Character[] | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  // Local mirror of what we believe the room holds. Every character lives
  // under its own metadata key (see rosterStore.ts), so an edit by one
  // player never rewrites another player's character, and incoming
  // metadata changes are merged per character: another player's edit shows
  // up immediately, while our own in-flight write can't be reverted by a
  // lagging echo of someone else's older write.
  const charsRef = useRef(new Map<string, StoredCharacter>());
  const indexRef = useRef<StoredIndex | null>(null);

  // Edits waiting out the debounce timer, per character, with the pre-edit
  // state to roll back to if the eventual write fails.
  const pendingEdits = useRef(new Map<string, { timer: number; previous?: StoredCharacter }>());

  // All room writes go through one queue so they always land in the order
  // we decided them - overlapping writes (a debounced flush racing a quick
  // follow-up edit) can't arrive out of order and let an older revision
  // overwrite a newer one.
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const enqueue = (job: () => Promise<void>): Promise<void> => {
    const run = writeQueue.current.then(job, job);
    writeQueue.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  const publish = () => {
    setRoster(composeRoster(indexRef.current, charsRef.current));
  };

  // Shared tail of every single-character write: portrait-stripping retry
  // when the room is full, rollback of local state when nothing lands.
  // Reads the character from charsRef at execution time so a debounced
  // flush always saves the latest edits, not the ones that started the
  // timer.
  const persistCharacter = async (id: string, previous?: StoredCharacter) => {
    const stored = charsRef.current.get(id);
    if (!stored) return;
    try {
      await OBR.room.setMetadata({ [CHAR_PREFIX + id]: stored });
      setSaveWarning(null);
      await syncLinkedToken(stored.character);
    } catch {
      // Room metadata is capped (shared across every extension in the
      // room). Manually-uploaded portraits are stored as data URLs and can
      // be large, so if the write is rejected we strip portraits that
      // aren't from a linked token (those are cheap, hosted URLs) and try
      // again, telling the user why.
      if (!stored.character.linkedTokenId && stored.character.portrait) {
        const stripped: StoredCharacter = { rev: nextRev(), character: { ...stored.character, portrait: null } };
        try {
          await OBR.room.setMetadata({ [CHAR_PREFIX + id]: stripped });
          charsRef.current.set(id, stripped);
          publish();
          setSaveWarning(
            "Room storage is full, so manually-uploaded portraits couldn't be saved. Assign a token to a character instead for a portrait that persists."
          );
          await syncLinkedToken(stripped.character);
          return;
        } catch {
          // Fall through to the full rollback below.
        }
      }
      if (previous) charsRef.current.set(id, previous);
      else charsRef.current.delete(id);
      publish();
      setSaveWarning("Couldn't save changes - room storage is full. Try removing a portrait or trimming notes.");
    }
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    OBR.onReady(async () => {
      await migrateLegacyRoster();
      const metadata = await OBR.room.getMetadata();
      mergeInto(metadata, charsRef.current);
      indexRef.current = parseIndex(metadata);
      publish();
      unsubscribe = OBR.room.onMetadataChange((metadata) => {
        const changed = mergeInto(metadata, charsRef.current);
        const incomingIndex = parseIndex(metadata);
        const known = indexRef.current;
        const roomIds = incomingIndex?.ids ?? known?.ids ?? [];
        // Character keys the index doesn't know about yet: an in-flight
        // add of ours, or an index update that lost a race.
        const extras = [...charsRef.current.keys()].filter((id) => !roomIds.includes(id));
        const ids = [...roomIds, ...extras];
        const indexChanged =
          !known || known.ids.length !== ids.length || known.ids.some((id, i) => id !== ids[i]);
        indexRef.current = { rev: incomingIndex?.rev ?? 0, ids };
        // Skip the re-render entirely when neither the characters nor the
        // index changed - other extensions write room metadata constantly,
        // and none of that should touch this sheet.
        if (changed || indexChanged) publish();
      });
    });
    return () => unsubscribe?.();
  }, []);

  // Immediate save, for actions that must land right away: adding a
  // character, GM visibility toggles. Compares by object identity - the
  // app reuses unchanged character objects when mapping over the roster -
  // and writes only the characters that actually changed. Deletion goes
  // through removeCharacter, which never races with a stale local snapshot.
  const saveRoster = async (next: Character[]) => {
    const jobs: Promise<void>[] = [];
    const addedIds: string[] = [];

    for (const c of next) {
      const current = charsRef.current.get(c.id);
      if (current && current.character === c) continue;
      const stored: StoredCharacter = { rev: nextRev(), character: c };
      charsRef.current.set(c.id, stored);
      jobs.push(enqueue(() => persistCharacter(c.id, current)));
      if (!current) addedIds.push(c.id);
    }

    if (addedIds.length > 0) {
      const index: StoredIndex = {
        rev: nextRev(),
        ids: [...(indexRef.current?.ids ?? []), ...addedIds],
      };
      indexRef.current = index;
      jobs.push(
        enqueue(async () => {
          try {
            await OBR.room.setMetadata({ [INDEX_KEY]: index });
            setSaveWarning(null);
          } catch {
            setSaveWarning("Couldn't save changes - room storage is full. Try removing a portrait or trimming notes.");
          }
        })
      );
    }

    if (jobs.length === 0) return;
    publish();
    await Promise.all(jobs);
  };

  // Debounced save for keystroke-level edits. The optimistic local update
  // is instant; the room write happens once typing pauses.
  const updateCharacter = (updated: Character) => {
    let pending = pendingEdits.current.get(updated.id);
    if (!pending) {
      pending = { timer: 0, previous: charsRef.current.get(updated.id) };
      pendingEdits.current.set(updated.id, pending);
    } else {
      window.clearTimeout(pending.timer);
    }
    charsRef.current.set(updated.id, { rev: nextRev(), character: updated });
    publish();
    const entry = pending;
    entry.timer = window.setTimeout(() => {
      pendingEdits.current.delete(updated.id);
      void enqueue(() => persistCharacter(updated.id, entry.previous));
    }, EDIT_DEBOUNCE_MS);
  };

  const removeCharacter = async (id: string) => {
    const pending = pendingEdits.current.get(id);
    if (pending) {
      window.clearTimeout(pending.timer);
      pendingEdits.current.delete(id);
    }
    const prevIndex = indexRef.current;
    const prevChar = charsRef.current.get(id);
    const index: StoredIndex = {
      rev: nextRev(),
      ids: (prevIndex?.ids ?? []).filter((x) => x !== id),
    };
    charsRef.current.delete(id);
    indexRef.current = index;
    publish();
    await enqueue(async () => {
      try {
        // One atomic call: clear the character's key and update the index
        // together, so no other client ever sees the index point at a
        // character that no longer exists (or vice versa).
        await OBR.room.setMetadata({ [CHAR_PREFIX + id]: null, [INDEX_KEY]: index });
        setSaveWarning(null);
      } catch {
        if (prevChar) charsRef.current.set(id, prevChar);
        indexRef.current = prevIndex;
        publish();
        setSaveWarning("Couldn't save changes - room storage is full.");
      }
    });
  };

  // If the panel closes while edits are still waiting out the debounce
  // timer, push them out best-effort rather than losing the last few
  // keystrokes.
  const flushPendingRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    flushPendingRef.current = () => {
      for (const [id, pending] of [...pendingEdits.current]) {
        window.clearTimeout(pending.timer);
        pendingEdits.current.delete(id);
        void enqueue(() => persistCharacter(id, pending.previous));
      }
    };
    const onBeforeUnload = () => flushPendingRef.current();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return { roster, saveRoster, updateCharacter, removeCharacter, saveWarning };
}
