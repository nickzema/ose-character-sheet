import type { Character } from "./types";
import HelpButton, { type TourStep } from "./HelpButton";

interface Props {
  characters: Character[];
  isGM: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onToggleHidden: (id: string) => void;
}

export default function CharacterList({ characters, isGM, onSelect, onAdd, onDelete, onToggleHidden }: Props) {
  const sorted = [...characters].sort((a, b) => {
    if (a.type !== b.type) return a.type === "PC" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const handleDelete = (e: React.MouseEvent, c: Character) => {
    e.stopPropagation();
    if (window.confirm(`Remove "${c.name || "this character"}" from the party?`)) {
      onDelete(c.id);
    }
  };

  const handleToggleHidden = (e: React.MouseEvent, c: Character) => {
    e.stopPropagation();
    onToggleHidden(c.id);
  };

  return (
    <div className="list">
      <div className="list-toolbar">
        <h2>Party</h2>
        <div className="list-toolbar-right">
          <HelpButton title="Party list help" steps={LIST_HELP_STEPS(isGM)} />
          <button className="btn" onClick={onAdd}>+ New</button>
        </div>
      </div>
      <div className="roster">
        {sorted.length === 0 && <div className="empty-state">No characters yet. Add one to get started.</div>}
        {sorted.map((c) => (
          <div key={c.id} className={`char-row ${c.hidden ? "hidden-row" : ""}`} onClick={() => onSelect(c.id)}>
            {c.portrait ? (
              <div className="type-chip portrait" style={{ backgroundImage: `url('${c.portrait}')` }} />
            ) : (
              <div className="type-chip" style={{ background: c.color }}>{c.type}</div>
            )}
            <div className="char-row-body" style={c.portrait ? { background: c.color } : undefined}>
              <div className="char-id">
                <div className="name">
                  {c.name || "Unnamed"}
                  {isGM && c.hidden && <span className="hidden-badge">HIDDEN</span>}
                </div>
                <div className="sub">
                  {c.className || "Class?"} &middot; Lv {c.level}
                  {c.title ? ` \u00b7 ${c.title}` : ""}
                  {c.alignment ? ` \u00b7 ${c.alignment}` : ""}
                </div>
              </div>
              <div className="row-right">
                <div className="hp-box">{c.player || ""}</div>
                {isGM && (
                  <button
                    className={`row-hide ${c.hidden ? "active" : ""}`}
                    data-tip={c.hidden ? "Visible only to you \u2014 click to reveal to players" : "Hide from players"}
                    onClick={(e) => handleToggleHidden(e, c)}
                  >
                    {c.hidden ? "\u{1F441}\uFE0F\u200D\u{1F5E8}\uFE0F" : "\u{1F441}\uFE0F"}
                  </button>
                )}
                {isGM && (
                  <button className="row-delete" data-tip="Remove from party" onClick={(e) => handleDelete(e, c)}>&times;</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const LIST_HELP_STEPS = (isGM: boolean): TourStep[] => {
  const steps: TourStep[] = [
    { selector: ".char-row", text: "Click anywhere on a row to open that character's sheet." },
  ];
  if (isGM) {
    steps.push(
      { selector: ".row-hide", text: "Click the eye to hide a character from players entirely \u2014 they won't see the row at all." },
      { selector: ".row-delete", text: "Removes a character from the party for good. Players can only delete their own PC, from inside the sheet." },
    );
  }
  return steps;
};
