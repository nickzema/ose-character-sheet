import type { Character } from "./types";

interface Props {
  characters: Character[];
  onSelect: (id: string) => void;
  onAdd: () => void;
}

export default function CharacterList({ characters, onSelect, onAdd }: Props) {
  const sorted = [...characters].sort((a, b) => {
    if (a.type !== b.type) return a.type === "PC" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="list">
      <div className="list-toolbar">
        <h2>Party</h2>
        <button className="btn" onClick={onAdd}>+ New</button>
      </div>
      <div className="roster">
        {sorted.length === 0 && <div className="empty-state">No characters yet. Add one to get started.</div>}
        {sorted.map((c) => (
          <div key={c.id} className="char-row" onClick={() => onSelect(c.id)}>
            {c.portrait ? (
              <div className="type-chip portrait" style={{ backgroundImage: `url('${c.portrait}')` }} />
            ) : (
              <div className="type-chip" style={{ background: c.color }}>{c.type}</div>
            )}
            <div className="char-row-body" style={c.portrait ? { background: c.color } : undefined}>
              <div className="char-id">
                <div className="name">{c.name || "Unnamed"}</div>
                <div className="sub">
                  {c.className || "Class?"} &middot; Lv {c.level}
                  {c.title ? ` \u00b7 ${c.title}` : ""}
                  {c.alignment ? ` \u00b7 ${c.alignment}` : ""}
                </div>
              </div>
              <div className="hp-box">{c.player || ""}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
