import { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { usePlayer, useRoster } from "./useOBR";
import { blankCharacter, type Character } from "./types";
import { setupContextMenu } from "./contextMenu";
import CharacterList from "./CharacterList";
import CharacterSheet from "./CharacterSheet";
import AssignPortraitPopover from "./AssignPortraitPopover";
import "./styles.css";

function useAssignParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("assign") !== "1") return null;
  return {
    tokenId: params.get("tokenId") || "",
    imageUrl: params.get("imageUrl") || "",
    tokenName: params.get("tokenName") || "Token",
  };
}

export default function App() {
  const assignParams = useAssignParams();
  const player = usePlayer();
  const { roster, saveRoster, saveWarning } = useRoster();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (assignParams) return; // the popover doesn't need the context menu
    OBR.onReady(() => setupContextMenu());
  }, [assignParams]);

  // The popover opened by right-clicking a token renders this instead of
  // the normal app - it's the same bundle, just a different query param.
  if (assignParams) {
    return (
      <AssignPortraitPopover
        tokenId={assignParams.tokenId}
        imageUrl={assignParams.imageUrl}
        tokenName={assignParams.tokenName}
      />
    );
  }

  if (!player || roster === null) {
    return <div className="loading">Loading party...</div>;
  }

  const canEdit = (c: Character) => player.role === "GM" || c.ownerId === player.id;

  const addCharacter = async () => {
    const c = blankCharacter(crypto.randomUUID(), player.id);
    c.player = player.name;
    await saveRoster([...roster, c]);
    setSelectedId(c.id);
  };

  const updateCharacter = (updated: Character) => {
    saveRoster(roster.map((c) => (c.id === updated.id ? updated : c)));
  };

  const deleteCharacter = (id: string) => {
    saveRoster(roster.filter((c) => c.id !== id));
    setSelectedId(null);
  };

  const selected = selectedId ? roster.find((c) => c.id === selectedId) ?? null : null;

  return (
    <div className="app">
      {saveWarning && <div className="save-warning">{saveWarning}</div>}
      {selected ? (
        <CharacterSheet
          character={selected}
          canEdit={canEdit(selected)}
          onChange={updateCharacter}
          onDelete={() => deleteCharacter(selected.id)}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <CharacterList characters={roster} onSelect={setSelectedId} onAdd={addCharacter} />
      )}
    </div>
  );
}
