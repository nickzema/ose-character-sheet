import { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { usePlayer, useRoster } from "./useOBR";
import { blankCharacter, type Character } from "./types";
import { setupContextMenu } from "./contextMenu";
import { syncLinkedToken } from "./statBubbles";
import CharacterList from "./CharacterList";
import CharacterSheet from "./CharacterSheet";
import AssignPortraitPopover from "./AssignPortraitPopover";
import "zemaria-ui/zemaria.css";
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
  const { roster, saveCharacter, deleteCharacter: removeCharacter, saveWarning } = useRoster();
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
  const isGM = player.role === "GM";

  const addCharacter = async () => {
    const c = blankCharacter(crypto.randomUUID(), player.id);
    c.player = player.name;
    await saveCharacter(c, true);
    setSelectedId(c.id);
  };

  const updateCharacter = (updated: Character) => {
    saveCharacter(updated);
    syncLinkedToken(updated);
  };

  const deleteCharacter = (id: string) => {
    removeCharacter(id);
    setSelectedId(null);
  };

  const toggleHidden = (id: string) => {
    const c = roster.find((x) => x.id === id);
    if (c) saveCharacter({ ...c, hidden: !c.hidden });
  };

  // Players never see hidden characters, anywhere in this list - not just
  // dimmed or locked, absent entirely. The GM still sees them (dimmed).
  const visibleRoster = isGM ? roster : roster.filter((c) => !c.hidden);

  const selected = selectedId ? visibleRoster.find((c) => c.id === selectedId) ?? null : null;

  return (
    <div className="app">
      {saveWarning && <div className="save-warning">{saveWarning}</div>}
      {selected ? (
        <CharacterSheet
          character={selected}
          canEdit={canEdit(selected)}
          isGM={isGM}
          onChange={updateCharacter}
          onDelete={() => deleteCharacter(selected.id)}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <CharacterList
          characters={visibleRoster}
          isGM={isGM}
          onSelect={setSelectedId}
          onAdd={addCharacter}
          onDelete={deleteCharacter}
          onToggleHidden={toggleHidden}
        />
      )}
    </div>
  );
}
