import { useState } from "react";
import { usePlayer, useRoster } from "./useOBR";
import { blankCharacter, type Character } from "./types";
import CharacterList from "./CharacterList";
import CharacterSheet from "./CharacterSheet";
import "./styles.css";

export default function App() {
  const player = usePlayer();
  const { roster, saveRoster } = useRoster();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!player || roster === null) {
    return <div className="loading">Loading party...</div>;
  }

  const canEdit = (c: Character) => player.role === "GM" || c.ownerId === player.id;

  const addCharacter = async () => {
    const c = blankCharacter(player.id, player.name);
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
