import { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import type { Character } from "./types";

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

export function useRoster() {
  const [roster, setRoster] = useState<Character[] | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    OBR.onReady(async () => {
      const metadata = await OBR.room.getMetadata();
      setRoster((metadata[METADATA_KEY] as Character[]) ?? []);
      unsubscribe = OBR.room.onMetadataChange((metadata) => {
        setRoster((metadata[METADATA_KEY] as Character[]) ?? []);
      });
    });
    return () => unsubscribe?.();
  }, []);

  const saveRoster = async (next: Character[]) => {
    setRoster(next); // optimistic
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
    }
  };

  return { roster, saveRoster, saveWarning };
}
