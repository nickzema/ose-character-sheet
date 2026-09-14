import type { Character, Abilities } from "./types";
import {
  strMelee,
  strOpenDoors,
  dexAC,
  dexMissile,
  dexInit,
  wisMagicSaves,
  conHP,
  chaReaction,
  chaMaxRetainers,
  chaLoyalty,
  fmtMod,
  unarmoredAC,
  movement,
} from "./abilities";

interface Props {
  character: Character;
  canEdit: boolean;
  onChange: (c: Character) => void;
  onDelete: () => void;
  onBack: () => void;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled,
  width,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
  width?: string;
}) {
  return (
    <label className="field" style={width ? { width } : undefined}>
      <span className="field-label">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function AbilityRow({
  label,
  ability,
  score,
  disabled,
  onChange,
}: {
  label: string;
  ability: keyof Abilities;
  score: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  let note = "";
  switch (ability) {
    case "str":
      note = `Melee ${fmtMod(strMelee(score))} · Open Doors ${strOpenDoors(score)}`;
      break;
    case "int":
      note = "Languages / literacy — see class";
      break;
    case "wis":
      note = `Magic saves ${fmtMod(wisMagicSaves(score))}`;
      break;
    case "dex":
      note = `AC ${fmtMod(dexAC(score))} · Missile ${fmtMod(dexMissile(score))} · Init ${fmtMod(dexInit(score))}`;
      break;
    case "con":
      note = `HP ${fmtMod(conHP(score))}`;
      break;
    case "cha":
      note = `Reactions ${fmtMod(chaReaction(score))} · Retainers ${chaMaxRetainers(score)} · Loyalty ${chaLoyalty(score)}`;
      break;
  }
  return (
    <div className="ability-row">
      <span className="ability-label">{label}</span>
      <input
        type="number"
        className="ability-score"
        value={score}
        disabled={disabled}
        min={1}
        max={18}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="ability-note">{note}</span>
    </div>
  );
}

export default function CharacterSheet({ character: c, canEdit, onChange, onDelete, onBack }: Props) {
  const set = <K extends keyof Character>(key: K, value: Character[K]) =>
    onChange({ ...c, [key]: value });

  const setAbility = (key: keyof Abilities, value: number) =>
    onChange({ ...c, abilities: { ...c.abilities, [key]: value } });

  const move = movement(c.baseMove);

  return (
    <div className="sheet">
      <div className="sheet-topbar">
        <button className="link-btn" onClick={onBack}>
          ← All characters
        </button>
        {canEdit && (
          <button className="link-btn danger" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>

      <section className="sheet-header">
        <input
          className="name-input"
          value={c.name}
          disabled={!canEdit}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Character name"
        />
        <div className="header-row">
          <Field label="Class" value={c.className} disabled={!canEdit} onChange={(v) => set("className", v)} width="32%" />
          <Field label="Title" value={c.title} disabled={!canEdit} onChange={(v) => set("title", v)} width="32%" />
          <Field label="Alignment" value={c.alignment} disabled={!canEdit} onChange={(v) => set("alignment", v)} width="32%" />
        </div>
        <div className="header-row">
          <Field label="Level" type="number" value={c.level} disabled={!canEdit} onChange={(v) => set("level", Number(v))} width="24%" />
          <Field label="XP" type="number" value={c.xp} disabled={!canEdit} onChange={(v) => set("xp", Number(v))} width="36%" />
          <Field label="Next Level XP" type="number" value={c.xpNext} disabled={!canEdit} onChange={(v) => set("xpNext", Number(v))} width="36%" />
        </div>
        <div className="owner-tag">Played by {c.ownerName}</div>
      </section>

      <section className="sheet-block">
        <h3>Abilities</h3>
        <AbilityRow label="STR" ability="str" score={c.abilities.str} disabled={!canEdit} onChange={(v) => setAbility("str", v)} />
        <AbilityRow label="INT" ability="int" score={c.abilities.int} disabled={!canEdit} onChange={(v) => setAbility("int", v)} />
        <AbilityRow label="WIS" ability="wis" score={c.abilities.wis} disabled={!canEdit} onChange={(v) => setAbility("wis", v)} />
        <AbilityRow label="DEX" ability="dex" score={c.abilities.dex} disabled={!canEdit} onChange={(v) => setAbility("dex", v)} />
        <AbilityRow label="CON" ability="con" score={c.abilities.con} disabled={!canEdit} onChange={(v) => setAbility("con", v)} />
        <AbilityRow label="CHA" ability="cha" score={c.abilities.cha} disabled={!canEdit} onChange={(v) => setAbility("cha", v)} />
      </section>

      <section className="sheet-block">
        <h3>Combat</h3>
        <div className="header-row">
          <Field label="HP Current" type="number" value={c.hpCurrent} disabled={!canEdit} onChange={(v) => set("hpCurrent", Number(v))} width="30%" />
          <Field label="HP Max" type="number" value={c.hpMax} disabled={!canEdit} onChange={(v) => set("hpMax", Number(v))} width="30%" />
          <Field label="AC" type="number" value={c.ac} disabled={!canEdit} onChange={(v) => set("ac", Number(v))} width="35%" />
        </div>
        <div className="derived-line">Unarmoured AC (10 + DEX mod): {unarmoredAC(c.abilities.dex)}</div>
        <div className="header-row">
          <Field label="Attack Bonus (class/level)" type="number" value={c.attackBonus} disabled={!canEdit} onChange={(v) => set("attackBonus", Number(v))} width="48%" />
        </div>
        <div className="derived-line">
          Melee total {fmtMod(c.attackBonus + strMelee(c.abilities.str))} · Missile total {fmtMod(c.attackBonus + dexMissile(c.abilities.dex))}
        </div>
      </section>

      <section className="sheet-block">
        <h3>Saving Throws</h3>
        <div className="header-row wrap">
          <Field label="Death/Poison" type="number" value={c.saves.death} disabled={!canEdit} onChange={(v) => onChange({ ...c, saves: { ...c.saves, death: Number(v) } })} width="30%" />
          <Field label="Wands" type="number" value={c.saves.wands} disabled={!canEdit} onChange={(v) => onChange({ ...c, saves: { ...c.saves, wands: Number(v) } })} width="30%" />
          <Field label="Paralysis" type="number" value={c.saves.paralysis} disabled={!canEdit} onChange={(v) => onChange({ ...c, saves: { ...c.saves, paralysis: Number(v) } })} width="30%" />
          <Field label="Breath" type="number" value={c.saves.breath} disabled={!canEdit} onChange={(v) => onChange({ ...c, saves: { ...c.saves, breath: Number(v) } })} width="30%" />
          <Field label="Spells" type="number" value={c.saves.spells} disabled={!canEdit} onChange={(v) => onChange({ ...c, saves: { ...c.saves, spells: Number(v) } })} width="30%" />
        </div>
        <div className="derived-line">WIS applies to saves vs. magic (not normally breath): {fmtMod(wisMagicSaves(c.abilities.wis))}</div>
      </section>

      <section className="sheet-block">
        <h3>Movement</h3>
        <Field label="Base (ft)" type="number" value={c.baseMove} disabled={!canEdit} onChange={(v) => set("baseMove", Number(v))} width="40%" />
        <div className="derived-line">
          Overland {move.overland} mi/day · Exploration {move.exploration} ft/turn · Encounter {move.encounter} ft/round
        </div>
      </section>

      <section className="sheet-block">
        <h3>Exploration</h3>
        <div className="header-row wrap">
          <Field label="Listen at Door" value={c.listenDoor} disabled={!canEdit} onChange={(v) => set("listenDoor", v)} width="47%" />
          <Field label="Find Secret Door" value={c.findSecretDoor} disabled={!canEdit} onChange={(v) => set("findSecretDoor", v)} width="47%" />
          <Field label="Find Room Trap" value={c.findTrap} disabled={!canEdit} onChange={(v) => set("findTrap", v)} width="47%" />
        </div>
        <div className="derived-line">Open Stuck Door (STR): {strOpenDoors(c.abilities.str)}</div>
      </section>

      <section className="sheet-block">
        <h3>Languages</h3>
        <textarea
          value={c.languages}
          disabled={!canEdit}
          onChange={(e) => set("languages", e.target.value)}
          rows={2}
        />
      </section>

      <section className="sheet-block">
        <h3>Equipment</h3>
        <span className="field-label">Equipped</span>
        <textarea
          value={c.equippedItems}
          disabled={!canEdit}
          onChange={(e) => set("equippedItems", e.target.value)}
          rows={3}
          placeholder="Armour worn, weapons held/sheathed, belt items..."
        />
        <span className="field-label">Packed</span>
        <textarea
          value={c.packedItems}
          disabled={!canEdit}
          onChange={(e) => set("packedItems", e.target.value)}
          rows={3}
          placeholder="Everything in sacks/backpacks..."
        />
      </section>

      <section className="sheet-block">
        <h3>Notes</h3>
        <textarea
          value={c.notes}
          disabled={!canEdit}
          onChange={(e) => set("notes", e.target.value)}
          rows={4}
          placeholder="Spells, mounts, retainers, clues..."
        />
      </section>
    </div>
  );
}
