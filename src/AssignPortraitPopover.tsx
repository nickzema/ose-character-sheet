import { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import type { Character } from "./types";
import { readRoster, writeCharacter } from "./rosterStore";
import { syncLinkedToken } from "./statBubbles";

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
      const [roster, role] = await Promise.all([readRoster(), OBR.player.getRole()]);
      setRoster(roster);
      setIsGM(role === "GM");
    });
  }, []);

  // Players shouldn't be able to spot a hidden NPC's existence via this
  // popover either - it's excluded here exactly like the main party list.
  const visibleRoster = roster && !isGM ? roster.filter((c) => !c.hidden) : roster;

  const assign = async (id: string) => {
    if (!roster) return;
    const linked = roster.find((c) => c.id === id);
    if (!linked) return;
    // Only this character's key is written - the rest of the party is never
    // touched, so this can't clobber anyone else's in-flight edits.
    await writeCharacter({ ...linked, portrait: imageUrl, linkedTokenId: tokenId });
    // Push name/HP/AC to the token right away, not just on the next sheet edit.
    await syncLinkedToken({ ...linked, portrait: imageUrl, linkedTokenId: tokenId });
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
