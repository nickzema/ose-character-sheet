import type { Character } from "./types";

interface Props {
  characters: Character[];
  onSelect: (id: string) => void;
  onAdd: () => void;
}

export default function CharacterList({ characters, onSelect, onAdd }: Props) {
  return (
    <div className="list">
      <div className="list-header">
        <h2>Party</h2>
        <button className="primary-btn" onClick={onAdd}>
          + New Character
        </button>
      </div>
      {characters.length === 0 && (
        <div className="empty-state">No characters yet. Add one to get started.</div>
      )}
      <ul className="char-list">
        {characters.map((c) => (
          <li key={c.id} className="char-card" onClick={() => onSelect(c.id)}>
            <div className="char-card-main">
              <span className="char-name">{c.name || "Unnamed"}</span>
              <span className="char-sub">
                {c.className || "Class?"} {c.level ? `Lv ${c.level}` : ""}
              </span>
            </div>
            <div className="char-card-hp">
              <span className={c.hpCurrent <= 0 ? "hp-zero" : c.hpCurrent < c.hpMax / 2 ? "hp-low" : ""}>
                {c.hpCurrent}/{c.hpMax} HP
              </span>
              <span className="char-owner">{c.ownerName}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
