import { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import type { Character } from "./types";
import { syncLinkedToken } from "./statBubbles";
import { charKey, migrateLegacy, readRoster } from "./useOBR";

interface Props {
  tokenId: string;
  imageUrl: string;
  tokenName: string;
}

export default function AssignPortraitPopover({ tokenId, imageUrl, tokenName }: Props) {
  const [roster, setRoster] = useState<Character[] | null>(null);
  const [isGM, setIsGM] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    OBR.onReady(async () => {
      try { await migrateLegacy(); } catch { /* ignore */ }
      const [metadata, role] = await Promise.all([OBR.room.getMetadata(), OBR.player.getRole()]);
      setRoster(readRoster(metadata));
      setIsGM(role === "GM");
    });
  }, []);

  // Players shouldn't be able to spot a hidden NPC's existence via this
  // popover either - it's excluded here exactly like the main party list.
  const visibleRoster = roster && !isGM ? roster.filter((c) => !c.hidden) : roster;

  const assign = async (id: string) => {
    if (!roster) return;
    const current = roster.find((c) => c.id === id);
    if (!current) return;
    const linked: Character = { ...current, portrait: imageUrl, linkedTokenId: tokenId, updatedAt: Math.max(Date.now(), current.updatedAt + 1) };
    await OBR.room.setMetadata({ [charKey(id)]: linked });
    // Push name/HP/AC to the token right away, not just on the next sheet edit.
    await syncLinkedToken(linked);
    setDone(true);
    setTimeout(() => OBR.popover.close(`com.p4p.ose-character-sheet/assign-popover`), 600);
  };

  if (done) {
    return <div className="assign-popover"><p className="assign-done">Token linked.</p></div>;
  }

  if (roster === null) {
    return <div className="assign-popover"><p>Loading party...</p></div>;
  }

  return (
    <div className="assign-popover">
      <div className="assign-header">
        <img src={imageUrl} alt="" className="assign-token-img" />
        <span>Assign "{tokenName}" to:</span>
      </div>
      <div className="assign-list">
        {visibleRoster!.length === 0 && <p className="assign-empty">No characters yet. Add one from the sheet panel first.</p>}
        {visibleRoster!.map((c) => (
          <button key={c.id} className="assign-row" onClick={() => assign(c.id)}>
            <span className="assign-chip" style={{ background: c.color }}>{c.type}</span>
            <span>{c.name || "Unnamed"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
