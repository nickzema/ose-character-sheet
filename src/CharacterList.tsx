import type { ReactNode } from "react";
import { nums, type Character } from "./types";
import { classStats, isClassKey } from "./classData";
import { thiefSkillsForLevel } from "./abilities";
import HelpButton, { type TourStep } from "./HelpButton";

interface Props {
  characters: Character[];
  isGM: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onToggleHidden: (id: string) => void;
  view: "party" | "inactive";
  inactiveCount: number;
  onShowInactive: () => void;
  onShowParty: () => void;
  canToggleActive: (c: Character) => boolean;
  onToggleActive: (id: string) => void;
  children?: ReactNode; // retainer stack, shown under the party rows
}

export default function CharacterList({ characters, isGM, onSelect, onAdd, onDelete, onToggleHidden, view, inactiveCount, onShowInactive, onShowParty, canToggleActive, onToggleActive, children }: Props) {
  const inactiveView = view === "inactive";
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
        <h2>{inactiveView ? "Inactive" : "Party"}</h2>
        <div className="list-toolbar-right">
          <HelpButton title="Party list help" steps={LIST_HELP_STEPS(isGM)} />
          {inactiveView ? (
            <button className="btn" onClick={onShowParty}>&larr; Party</button>
          ) : (
            <>
              <button className="btn" data-tour="inactive-btn" onClick={onShowInactive}>Inactive{inactiveCount ? ` (${inactiveCount})` : ""}</button>
              <button className="btn" onClick={onAdd}>+ New</button>
            </>
          )}
        </div>
      </div>
      <div className="roster">
        {sorted.length === 0 && <div className="empty-state">{inactiveView ? "No inactive characters." : "No characters yet. Add one to get started."}</div>}
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
                  {(() => {
                    const t = c.title || (isClassKey(c.classKey) ? classStats(c.classKey, c.level, nums(c.abilities), thiefSkillsForLevel(c.level).HN).title : "");
                    return t ? ` \u00b7 ${t}` : "";
                  })()}
                  {c.alignment ? ` \u00b7 ${c.alignment}` : ""}
                </div>
              </div>
              <div className="row-right">
                <div className="hp-box">{c.player || ""}</div>
                {canToggleActive(c) && (
                  <button className="row-hide row-act" data-tip={c.inactive ? "Make active" : "Make inactive"}
                    onClick={(e) => { e.stopPropagation(); onToggleActive(c.id); }}>
                    {c.inactive ? "Active" : "Inactive"}
                  </button>
                )}
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
      {children}
      <div className="brand-footer">
        <span className="brand-mark" aria-hidden="true" />
        <span>Another Zemaria product</span>
      </div>
    </div>
  );
}

const LIST_HELP_STEPS = (isGM: boolean): TourStep[] => {
  const steps: TourStep[] = [
    { selector: ".char-row", text: "Click anywhere on a row to open that character's sheet." },
    { selector: '[data-tour="inactive-btn"]', text: "Inactive characters are tucked away here; reactivate them from this list." },
    { selector: '[data-tour="rt-card"]', text: "Click a retainer card to select it. Only the owner and GM can edit: click XP to enter it (XP sets Level), and click AC or MV to adjust them." },
    { selector: ".rt-owner", text: "Assign the retainer to a character. Everyone then sees it in that character's sheet color; the owner can still pick a personal color that only they see." },
  ];
  if (!isGM) steps.push({ selector: '[data-tour="rt-mine"]', text: "Show only the retainers belonging to your characters." });
  if (isGM) {
    steps.push(
    { selector: '[data-tour="rt-generate"]', text: "Generate a random retainer: class, level, stats, gear, and name." },
      { selector: '[data-tour="rt-view"]', text: "View by player: see one character's retainers with the colors that player sees, or just the unassigned ones." },
      { selector: ".row-hide", text: "Click the eye to hide a character from players entirely \u2014 they won't see the row at all." },
      { selector: ".row-delete", text: "Removes a character from the party for good. Players can only delete their own PC, from inside the sheet." },
    );
  }
  return steps;
};
