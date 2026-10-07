import OBR from "@owlbear-rodeo/sdk";
import { healCharacter, type Character } from "./types";

/**
 * Room-metadata storage layout (v2).
 *
 * v1 stored the whole party as one array under a single key, so every edit
 * from any player rewrote everyone else's characters too. Two clients editing
 * at the same time meant one full-roster write clobbered the other, which is
 * where "my character disappeared / inventory went blank" came from.
 *
 * v2 gives every character its own metadata key, so an edit only ever touches
 * that one character. A small index key just records the character ids (it
 * never holds character data). Each stored value carries a `rev` (a
 * millisecond timestamp, kept monotonic per client); when metadata changes
 * arrive, each character is merged independently by revision, so another
 * player's edit shows up live instead of being dropped as a "stale echo".
 */

export const INDEX_KEY = "com.p4p.ose-character-sheet/roster-index";
export const CHAR_PREFIX = "com.p4p.ose-character-sheet/character/";
// v1 keys. Migrated to the per-character keys on first load, then deleted
// (a null value deletes a metadata key). If the migration write fails
// (room storage full), the legacy keys are left untouched and still read.
export const LEGACY_ROSTER_KEY = "com.p4p.ose-character-sheet/roster";
export const LEGACY_REV_KEY = "com.p4p.ose-character-sheet/roster-rev";

export interface StoredCharacter {
  rev: number;
  character: Character;
}

export interface StoredIndex {
  rev: number;
  ids: string[];
}

// Monotonic-per-client revision clock. Date.now() alone can repeat within
// the same millisecond, so never go backwards relative to our last rev.
let lastRev = 0;
export function nextRev(): number {
  lastRev = Math.max(Date.now(), lastRev + 1);
  return lastRev;
}

export function parseIndex(metadata: Record<string, unknown>): StoredIndex | null {
  const raw = metadata[INDEX_KEY] as Partial<StoredIndex> | undefined;
  if (!raw || !Array.isArray(raw.ids)) return null;
  return {
    rev: typeof raw.rev === "number" ? raw.rev : 0,
    ids: raw.ids.filter((id): id is string => typeof id === "string"),
  };
}

function parseCharacters(metadata: Record<string, unknown>): Map<string, StoredCharacter> {
  const chars = new Map<string, StoredCharacter>();
  for (const [key, value] of Object.entries(metadata)) {
    if (!key.startsWith(CHAR_PREFIX) || !value) continue;
    const stored = value as Partial<StoredCharacter>;
    const character = stored.character as Partial<Character> | undefined;
    if (!character || typeof character.id !== "string") continue;
    chars.set(character.id, {
      rev: typeof stored.rev === "number" ? stored.rev : 0,
      character: healCharacter(character as Partial<Character> & { id: string }),
    });
  }
  return chars;
}

/**
 * Legacy fallback: characters that only exist in the v1 roster array (i.e.
 * migration hasn't landed or failed). They get rev 0 so any real per-character
 * write outranks them, and they disappear once the migration deletes the
 * legacy keys.
 */
function addLegacyCharacters(metadata: Record<string, unknown>, chars: Map<string, StoredCharacter>) {
  const legacy = metadata[LEGACY_ROSTER_KEY];
  if (!Array.isArray(legacy)) return;
  for (const raw of legacy) {
    const c = raw as Partial<Character> | null;
    if (!c || typeof c.id !== "string" || chars.has(c.id)) continue;
    chars.set(c.id, {
      rev: 0,
      character: healCharacter(c as Partial<Character> & { id: string }),
    });
  }
}

/**
 * The roster as a plain array: index order first (skipping ids whose
 * character key is gone), then any character keys the index doesn't know
 * about yet (a write that landed before its index update, or our own
 * optimistic local state), oldest revision first.
 */
export function composeRoster(
  index: StoredIndex | null,
  chars: Map<string, StoredCharacter>
): Character[] {
  const ids = index?.ids ?? [];
  const list: Character[] = [];
  for (const id of ids) {
    const stored = chars.get(id);
    if (stored) list.push(stored.character);
  }
  const known = new Set(ids);
  const extras = [...chars.keys()]
    .filter((id) => !known.has(id))
    .sort((a, b) => chars.get(a)!.rev - chars.get(b)!.rev);
  for (const id of extras) list.push(chars.get(id)!.character);
  return list;
}

/**
 * Merge one incoming metadata snapshot into `chars`, per character. A
 * character is only replaced when its incoming revision is strictly newer
 * than what we already have - so a stale echo of SOMEONE ELSE'S write can
 * never revert the character we just edited, and everyone else's edits
 * still appear immediately. Returns true when anything actually changed,
 * so callers can skip re-rendering on unrelated metadata writes (other
 * plugins write room metadata too).
 */
export function mergeInto(
  metadata: Record<string, unknown>,
  chars: Map<string, StoredCharacter>
): boolean {
  let changed = false;
  const incoming = parseCharacters(metadata);
  for (const [id, stored] of incoming) {
    const current = chars.get(id);
    if (!current) {
      chars.set(id, stored);
      changed = true;
    } else if (stored.rev > current.rev) {
      chars.set(id, stored);
      changed = true;
    }
  }
  const before = chars.size;
  addLegacyCharacters(metadata, chars);
  if (chars.size !== before) changed = true;
  return changed;
}

/**
 * Read the full roster straight from the room (used by the assign popover,
 * which runs without the sheet's hook state). Also runs the legacy
 * migration first so it never sees half-migrated data.
 */
export async function readRoster(): Promise<Character[]> {
  await migrateLegacyRoster();
  const metadata = await OBR.room.getMetadata();
  const chars = parseCharacters(metadata);
  addLegacyCharacters(metadata, chars);
  return composeRoster(parseIndex(metadata), chars);
}

/** Write a single character to its own key. Used by the assign popover. */
export async function writeCharacter(character: Character): Promise<void> {
  await OBR.room.setMetadata({
    [CHAR_PREFIX + character.id]: { rev: nextRev(), character },
  });
}

/**
 * One-time migration from the v1 whole-roster layout. Writes every legacy
 * character to its own key plus the index, and deletes the legacy keys, in
 * one atomic setMetadata call - if the write fails (e.g. room storage is
 * full because of big portrait data URLs), the legacy keys are left intact
 * and the legacy fallback above keeps those characters readable.
 */
export async function migrateLegacyRoster(): Promise<void> {
  const metadata = await OBR.room.getMetadata();
  const legacy = metadata[LEGACY_ROSTER_KEY];
  if (!Array.isArray(legacy)) return;

  const chars = parseCharacters(metadata);
  const index = parseIndex(metadata);
  const rev = Math.max(nextRev(), ((metadata[LEGACY_REV_KEY] as number) ?? 0) + 1);

  const writes: Record<string, unknown> = {
    [LEGACY_ROSTER_KEY]: null,
    [LEGACY_REV_KEY]: null,
  };
  const legacyIds: string[] = [];
  for (const raw of legacy) {
    const c = raw as Partial<Character> | null;
    if (!c || typeof c.id !== "string" || chars.has(c.id)) continue;
    const character = healCharacter(c as Partial<Character> & { id: string });
    legacyIds.push(character.id);
    writes[CHAR_PREFIX + character.id] = { rev, character };
  }

  const existingIds = index?.ids ?? [];
  const ids = [...legacyIds, ...existingIds.filter((id) => !legacyIds.includes(id))];
  writes[INDEX_KEY] = { rev, ids };

  try {
    await OBR.room.setMetadata(writes);
  } catch {
    // Leave the legacy keys in place; addLegacyCharacters keeps them visible.
  }
}
