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

      unsubscribe = OBR.player.onChange((p) => {
        setPlayer({ id: p.id, name: p.name, role: p.role });
      });
    });

    return () => unsubscribe?.();
  }, []);

  return player;
}

export function useRoster() {
  const [roster, setRoster] = useState<Character[] | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    OBR.onReady(async () => {
      const metadata = await OBR.room.getMetadata();
      setRoster(((metadata[METADATA_KEY] as Character[]) ?? []));

      unsubscribe = OBR.room.onMetadataChange((metadata) => {
        setRoster(((metadata[METADATA_KEY] as Character[]) ?? []));
      });
    });

    return () => unsubscribe?.();
  }, []);

  const saveRoster = async (next: Character[]) => {
    setRoster(next); // optimistic
    await OBR.room.setMetadata({ [METADATA_KEY]: next });
  };

  return { roster, saveRoster };
}
