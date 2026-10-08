import { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import type { Character } from "./types";
import type { Retainer } from "./retainerTypes";
import { syncLinkedToken } from "./statBubbles";
import { charKey, migrateLegacy, readRoster, readRetainers, retKey } from "./useOBR";

interface Props {
  tokenId: string;
  imageUrl: string;
  tokenName: string;
  kind: "character" | "retainer";
}

export default function AssignPortraitPopover({ tokenId, imageUrl, tokenName, kind }: Props) {
  const [roster, setRoster] = useState<Character[] | null>(null);
  const [retainers, setRetainers] = useState<Retainer[] | null>(null);
  const [isGM, setIsGM] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    OBR.onReady(async () => {
      try { await migrateLegacy(); } catch { /* ignore */ }
      const [metadata, role] = await Promise.all([OBR.room.getMetadata(), OBR.player.getRole()]);
      setRoster(readRoster(metadata));
      setRetainers(readRetainers(metadata));
      setIsGM(role === "GM");
    });
  }, []);

  // Players shouldn't be able to spot a hidden NPC's existence via this
  // popover either - it's excluded here exactly like the main party list.
  const visibleRoster = roster && !isGM ? roster.filter((c) => !c.hidden) : roster;

  const assignRetainer = async (id: string) => {
    const current = retainers?.find((r) => r.id === id);
    if (!current) return;
    const linked: Retainer = { ...current, linkedTokenId: tokenId, updatedAt: Math.max(Date.now(), current.updatedAt + 1) };
    await OBR.room.setMetadata({ [retKey(id)]: linked });
    // Push name/HP/AC to the token right away, not just on the next card edit.
    await syncLinkedToken(linked);
    setDone(true);
    setTimeout(() => OBR.popover.close(`com.p4p.ose-character-sheet/assign-popover`), 600);
  };

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

  if (roster === null || retainers === null) {
    return <div className="assign-popover"><p>Loading party...</p></div>;
  }

  if (kind === "retainer") {
    const visibleRetainers = isGM ? retainers : retainers.filter((r) => !r.hidden);
    return (
      <div className="assign-popover">
        <div className="assign-header">
          <img src={imageUrl} alt="" className="assign-token-img" />
          <span>Assign "{tokenName}" to:</span>
        </div>
        <div className="assign-list">
          {visibleRetainers.length === 0 && <p className="assign-empty">No retainers yet.</p>}
          {visibleRetainers.map((r) => (
            <button key={r.id} className="assign-row" onClick={() => assignRetainer(r.id)}>
              <span className="assign-chip" style={{ background: r.color }}>{r.classKey === "Normal Human" ? "NH" : `L${r.level}`}</span>
              <span>{r.name || "Unnamed"}</span>
            </button>
          ))}
        </div>
      </div>
    );
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
