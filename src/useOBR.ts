import { useEffect, useRef, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { healCharacter, type Character } from "./types";

const METADATA_KEY = "com.p4p.ose-character-sheet/roster";

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

function loadRoster(metadata: Record<string, unknown>): Character[] {
  const raw = (metadata[METADATA_KEY] as Partial<Character>[]) ?? [];
  return raw.map((c) => healCharacter(c as Partial<Character> & { id: string }));
}

export function useRoster() {
  const [roster, setRoster] = useState<Character[] | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  // Counts writes we've sent but haven't been confirmed yet. Every field
  // edit (including each keystroke) broadcasts the whole roster over the
  // network, so during rapid typing several writes can be in flight at
  // once - and their round trips don't always resolve in the order they
  // were sent. If we applied every incoming room-metadata echo as it
  // arrives, a slow echo of an EARLIER write could land after a newer
  // one and clobber what was just typed (this is what caused spells,
  // and even the Cleric/Magic-User checkboxes, to intermittently revert
  // or empty out while someone was mid-edit). While any of our own
  // writes are still outstanding, our local optimistic state is already
  // the most current thing we know about, so incoming echoes are
  // ignored rather than applied - only once every outstanding write has
  // settled do we trust the room's metadata again.
  const pendingWrites = useRef(0);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    OBR.onReady(async () => {
      const metadata = await OBR.room.getMetadata();
      setRoster(loadRoster(metadata));
      unsubscribe = OBR.room.onMetadataChange((metadata) => {
        if (pendingWrites.current > 0) return;
        setRoster(loadRoster(metadata));
      });
    });
    return () => unsubscribe?.();
  }, []);

  const saveRoster = async (next: Character[]) => {
    setRoster(next); // optimistic
    pendingWrites.current++;
    try {
      // Room metadata is capped (shared across every extension in the room).
      // Manually-uploaded portraits are stored as data URLs and can be large,
      // so if the write is rejected we strip portraits that aren't from a
      // linked token (those are cheap, hosted URLs) and try again, telling
      // the user why.
      await OBR.room.setMetadata({ [METADATA_KEY]: next });
      setSaveWarning(null);
    } catch (err) {
      const stripped = next.map((c) =>
        c.linkedTokenId ? c : { ...c, portrait: null }
      );
      try {
        await OBR.room.setMetadata({ [METADATA_KEY]: stripped });
        setRoster(stripped);
        setSaveWarning(
          "Room storage is full, so manually-uploaded portraits couldn't be saved. Assign a token to a character instead for a portrait that persists."
        );
      } catch {
        setSaveWarning("Couldn't save changes - room storage is full. Try removing a portrait or trimming notes.");
      }
    } finally {
      pendingWrites.current--;
    }
  };

  return { roster, saveRoster, saveWarning };
}
