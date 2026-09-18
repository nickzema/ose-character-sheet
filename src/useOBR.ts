import { useEffect, useRef, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { healCharacter, type Character } from "./types";

const METADATA_KEY = "com.p4p.ose-character-sheet/roster";
const REV_KEY = "com.p4p.ose-character-sheet/roster-rev";

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
  // A logical clock, not a "writes in flight" counter. Every write carries
  // the next revision number, and any incoming room-metadata echo whose
  // revision is behind the highest one we've already sent or accepted is
  // ignored outright. This is what a "pending writes" counter can't
  // guarantee: each write's own promise resolves once the SERVER acks it,
  // but the separate onMetadataChange broadcast that echoes it back to
  // every client (including us) is a different channel that can lag
  // further behind - so an old echo can still arrive after a "no writes
  // pending" counter has already dropped to zero, and silently revert
  // whatever was just typed (this is what was reverting Detailed
  // Inventory to Basic mid-edit, and making brand-new characters vanish
  // back to the party list before their first save had even settled).
  // A revision number sidesteps the timing question entirely: it doesn't
  // matter when an echo arrives, only whether it's actually newer.
  const revRef = useRef(0);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    OBR.onReady(async () => {
      const metadata = await OBR.room.getMetadata();
      setRoster(loadRoster(metadata));
      revRef.current = (metadata[REV_KEY] as number) ?? 0;
      unsubscribe = OBR.room.onMetadataChange((metadata) => {
        const incomingRev = (metadata[REV_KEY] as number) ?? 0;
        if (incomingRev < revRef.current) return; // stale echo - ignore
        revRef.current = incomingRev;
        setRoster(loadRoster(metadata));
      });
    });
    return () => unsubscribe?.();
  }, []);

  const saveRoster = async (next: Character[]) => {
    const rev = ++revRef.current;
    setRoster(next); // optimistic
    try {
      // Room metadata is capped (shared across every extension in the room).
      // Manually-uploaded portraits are stored as data URLs and can be large,
      // so if the write is rejected we strip portraits that aren't from a
      // linked token (those are cheap, hosted URLs) and try again, telling
      // the user why.
      await OBR.room.setMetadata({ [METADATA_KEY]: next, [REV_KEY]: rev });
      setSaveWarning(null);
    } catch (err) {
      const stripped = next.map((c) =>
        c.linkedTokenId ? c : { ...c, portrait: null }
      );
      try {
        await OBR.room.setMetadata({ [METADATA_KEY]: stripped, [REV_KEY]: rev });
        setRoster(stripped);
        setSaveWarning(
          "Room storage is full, so manually-uploaded portraits couldn't be saved. Assign a token to a character instead for a portrait that persists."
        );
      } catch {
        // Nothing actually landed in the room this time - don't leave the
        // revision counter ahead of what the room really has, or a later
        // legitimate echo at the old revision would get wrongly ignored.
        revRef.current--;
        setSaveWarning("Couldn't save changes - room storage is full. Try removing a portrait or trimming notes.");
      }
    }
  };

  return { roster, saveRoster, saveWarning };
}
