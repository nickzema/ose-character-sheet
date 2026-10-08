import { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { usePlayer, useRoster, useRetainers } from "./useOBR";
import { blankCharacter, type Character } from "./types";
import { generateRetainer } from "./retainerGen";
import type { Retainer } from "./retainerTypes";
import { setupContextMenu } from "./contextMenu";
import { syncLinkedToken } from "./statBubbles";
import CharacterList from "./CharacterList";
import CharacterSheet from "./CharacterSheet";
import RetainerStack from "./RetainerStack";
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
    kind: params.get("kind") === "retainer" ? ("retainer" as const) : ("character" as const),
  };
}

export default function App() {
  const assignParams = useAssignParams();
  const player = usePlayer();
  const { roster, saveCharacter, deleteCharacter: removeCharacter, saveWarning } = useRoster();
  const { retainers, saveRetainer, saveRetainers, deleteRetainer, retainerWarning } = useRetainers();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"party" | "inactive">("party");

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
        kind={assignParams.kind}
      />
    );
  }

  if (!player || roster === null || retainers === null) {
    return <div className="loading">Loading party...</div>;
  }

  const canEdit = (c: Character) => player.role === "GM" || c.ownerId === player.id;
  const isGM = player.role === "GM";

  const addCharacter = async () => {
    const c = blankCharacter(crypto.randomUUID(), player.id);
    // A GM's new sheet starts as an NPC; a player's starts as their own PC.
    if (isGM) c.type = "NPC";
    else c.player = player.name;
    await saveCharacter(c, true);
    setSelectedId(c.id);
  };

  const updateCharacter = (updated: Character) => {
    saveCharacter(updated);
    syncLinkedToken(updated);
  };

  const deleteCharacter = (id: string) => {
    removeCharacter(id);
    // Retainers that served this character go back to unhired.
    retainers.filter((r) => r.ownerCharacterId === id).forEach((r) => saveRetainer({ ...r, ownerCharacterId: "" }));
    setSelectedId(null);
  };

  const toggleHidden = (id: string) => {
    const c = roster.find((x) => x.id === id);
    if (c) saveCharacter({ ...c, hidden: !c.hidden });
  };

  const toggleActive = (id: string) => {
    const c = roster.find((x) => x.id === id);
    if (c) saveCharacter({ ...c, inactive: !c.inactive });
  };

  const updateRetainer = (r: Retainer) => {
    saveRetainer(r);
    syncLinkedToken(r);
  };

  const generate = () => {
    if (!isGM) return;
    const next = retainers.reduce((m, r) => Math.max(m, r.order), -1) + 1;
    const top = roster.reduce((m, c) => (c.type === "PC" && !c.inactive ? Math.max(m, c.level) : m), 0);
    saveRetainer(generateRetainer(next, top + 1), true);
  };

  // Players never see hidden characters, anywhere in this list - not just
  // dimmed or locked, absent entirely. The GM still sees them (dimmed).
  const visibleRoster = isGM ? roster : roster.filter((c) => !c.hidden);
  const partyRoster = visibleRoster.filter((c) => !c.inactive);
  const inactiveRoster = visibleRoster.filter((c) => c.inactive);

  const selected = selectedId ? visibleRoster.find((c) => c.id === selectedId) ?? null : null;

  return (
    <div className="app">
      {(saveWarning || retainerWarning) && <div className="save-warning">{saveWarning || retainerWarning}</div>}
      {selected ? (
        <CharacterSheet
          character={selected}
          canEdit={canEdit(selected)}
          isGM={isGM}
          me={{ id: player.id, name: player.name }}
          onChange={updateCharacter}
          onDelete={() => deleteCharacter(selected.id)}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <CharacterList
          characters={view === "inactive" ? inactiveRoster : partyRoster}
          isGM={isGM}
          onSelect={setSelectedId}
          onAdd={addCharacter}
          onDelete={deleteCharacter}
          onToggleHidden={toggleHidden}
          view={view}
          inactiveCount={inactiveRoster.length}
          onShowInactive={() => setView("inactive")}
          onShowParty={() => setView("party")}
          canToggleActive={canEdit}
          onToggleActive={toggleActive}
        >
          {view === "party" && (
            <RetainerStack
              retainers={retainers}
              characters={roster}
              playerId={player.id}
              isGM={isGM}
              onSave={updateRetainer}
              onSaveMany={saveRetainers}
              onDelete={deleteRetainer}
              onGenerate={generate}
            />
          )}
        </CharacterList>
      )}
    </div>
  );
}
