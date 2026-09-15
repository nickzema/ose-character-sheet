import { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import type { Character } from "./types";

const METADATA_KEY = "com.p4p.ose-character-sheet/roster";

interface Props {
  tokenId: string;
  imageUrl: string;
  tokenName: string;
}

export default function AssignPortraitPopover({ tokenId, imageUrl, tokenName }: Props) {
  const [roster, setRoster] = useState<Character[] | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    OBR.onReady(async () => {
      const metadata = await OBR.room.getMetadata();
      setRoster((metadata[METADATA_KEY] as Character[]) ?? []);
    });
  }, []);

  const assign = async (id: string) => {
    if (!roster) return;
    const next = roster.map((c) =>
      c.id === id ? { ...c, portrait: imageUrl, linkedTokenId: tokenId } : c
    );
    await OBR.room.setMetadata({ [METADATA_KEY]: next });
    setDone(true);
    setTimeout(() => OBR.popover.close(`com.p4p.ose-character-sheet/assign-popover`), 600);
  };

  if (done) {
    return <div className="assign-popover"><p className="assign-done">Portrait assigned.</p></div>;
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
        {roster.length === 0 && <p className="assign-empty">No characters yet. Add one from the sheet panel first.</p>}
        {roster.map((c) => (
          <button key={c.id} className="assign-row" onClick={() => assign(c.id)}>
            <span className="assign-chip" style={{ background: c.color }}>{c.type}</span>
            <span>{c.name || "Unnamed"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
