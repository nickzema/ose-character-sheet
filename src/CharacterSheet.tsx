import { useState } from "react";
import type { Character, Weapon, SpellLevel } from "./types";
import { abilityMod, strOpenDoors, fmtMod, unarmoredAC } from "./abilities";
import { rollWeapon } from "./dice";

interface Props {
  character: Character;
  canEdit: boolean;
  onChange: (c: Character) => void;
  onDelete: () => void;
  onBack: () => void;
}

const SWATCHES: [string, string][] = [
  ["#FCFBF8", "White"],
  ["#E8D9AE", "Manila"],
  ["#D8D4C8", "Newsprint"],
  ["#DCD3E8", "Mimeograph Purple"],
  ["#C7D6BE", "Sage Green"],
  ["#CBD3D6", "Chainmail Blue"],
  ["#D7E3EC", "OSR Blue"],
];

const THIEF_SKILL_KEYS = ["CS", "TR", "HN", "HS", "MS", "OL", "PP"];

function ChipRow({ chip, value, onChange, disabled, narrow, width }: {
  chip: string; value: string | number; onChange?: (v: string) => void;
  disabled?: boolean; narrow?: string; width?: string;
}) {
  return (
    <div className="chip-row" style={width ? { flex: `0 0 ${width}` } : undefined}>
      <div className="chip">{chip}</div>
      <div className="box">
        <input value={value} disabled={disabled} onChange={(e) => onChange?.(e.target.value)} />
      </div>
      {narrow !== undefined && (
        <div className="box narrow"><input value={narrow} disabled readOnly /></div>
      )}
    </div>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div className="row-2">{children}</div>;
}

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="caption">{children}</p>;
}

export default function CharacterSheet({ character: c, canEdit, onChange, onDelete, onBack }: Props) {
  const [colorOpen, setColorOpen] = useState(false);
  const [rollResult, setRollResult] = useState<string | null>(null);

  const set = <K extends keyof Character>(key: K, value: Character[K]) => onChange({ ...c, [key]: value });
  const setAbility = (k: keyof Character["abilities"], v: number) => onChange({ ...c, abilities: { ...c.abilities, [k]: v } });
  const setSave = (k: keyof Character["saves"], v: number) => onChange({ ...c, saves: { ...c.saves, [k]: v } });

  const strMod = abilityMod(c.abilities.str);
  const dexMod = abilityMod(c.abilities.dex);
  const wisMod = abilityMod(c.abilities.wis);
  const conMod = abilityMod(c.abilities.con);
  const chaMod = abilityMod(c.abilities.cha);

  const doRoll = async (weapon: Weapon) => {
    setRollResult(`Rolling ${weapon.name || "weapon"}...`);
    const mod = weapon.ranged ? dexMod : strMod;
    const { summary } = await rollWeapon(weapon.name, weapon.damage, c.attackBonus, mod);
    setRollResult(summary);
  };

  const updateWeapon = (i: number, patch: Partial<Weapon>) => {
    const weapons = c.weapons.map((w, idx) => (idx === i ? { ...w, ...patch } : w));
    set("weapons", weapons);
  };
  const addWeaponRow = () => set("weapons", [...c.weapons, { name: "", damage: "", ranged: false }]);

  const updateSpellLevel = (i: number, patch: Partial<SpellLevel>) => {
    const levels = c.spellLevels.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    set("spellLevels", levels);
  };

  const strTags = ["STR 18+", "STR 16+", "STR 13+", "STR 9+", "STR 6+", "STR 4+"];

  return (
    <div className="sheet-view" style={{ background: c.color }}>
      <div className="sheet-topbar">
        <button className="btn text" onClick={onBack}>&larr; All characters</button>
        {canEdit && <button className="btn text danger" onClick={onDelete}>Delete</button>}
      </div>

      <div className="color-picker">
        <button className="color-current" style={{ background: c.color }} onClick={() => setColorOpen((o) => !o)} disabled={!canEdit} />
        <span className="color-label" onClick={() => canEdit && setColorOpen((o) => !o)}>Sheet Color</span>
        {colorOpen && (
          <div className="color-options open">
            {SWATCHES.map(([hex, name]) => (
              <button key={hex} className="swatch" style={{ background: hex }} title={name}
                onMouseEnter={() => onChange({ ...c, color: hex })}
                onClick={() => setColorOpen(false)} />
            ))}
          </div>
        )}
      </div>

      <div className="sheet-grid">
        <div className="col-left">

          <div className="name-row">
            <div className="chip-row">
              <button className="chip chip-toggle" disabled={!canEdit}
                onClick={() => set("type", c.type === "PC" ? "NPC" : "PC")}>{c.type}</button>
              <div className="box"><input value={c.name} disabled={!canEdit} placeholder="Character name" onChange={(e) => set("name", e.target.value)} /></div>
              <div className="box player-box">
                <input value={c.player} disabled={!canEdit}
                  placeholder={c.type === "PC" ? "Player name" : "Belongs to (PC)"}
                  onChange={(e) => set("player", e.target.value)} />
              </div>
            </div>
            <Row2>
              <ChipRow chip="Class" value={c.className} disabled={!canEdit} onChange={(v) => set("className", v)} />
              <ChipRow chip="AL" value={c.alignment} disabled={!canEdit} onChange={(v) => set("alignment", v)} />
            </Row2>
            <Row2>
              <ChipRow chip="Title" value={c.title} disabled={!canEdit} onChange={(v) => set("title", v)} />
              <ChipRow chip="Level" value={c.level} disabled={!canEdit} onChange={(v) => set("level", Number(v) || 1)} />
            </Row2>
          </div>

          <div className="twoup">
            <div>
              <h3>Ability Scores</h3>
              <Caption>Roll under or equal on 1d20</Caption>
              <ChipRow chip="STR" value={c.abilities.str} narrow={fmtMod(strMod)} disabled={!canEdit} onChange={(v) => setAbility("str", Number(v) || 0)} />
              <Caption>Melee, Open doors {strOpenDoors(c.abilities.str)}</Caption>
              <ChipRow chip="INT" value={c.abilities.int} narrow={fmtMod(abilityMod(c.abilities.int))} disabled={!canEdit} onChange={(v) => setAbility("int", Number(v) || 0)} />
              <Caption>Languages, Literacy</Caption>
              <ChipRow chip="WIS" value={c.abilities.wis} narrow={fmtMod(wisMod)} disabled={!canEdit} onChange={(v) => setAbility("wis", Number(v) || 0)} />
              <Caption>Saves vs magic</Caption>
              <ChipRow chip="DEX" value={c.abilities.dex} narrow={fmtMod(dexMod)} disabled={!canEdit} onChange={(v) => setAbility("dex", Number(v) || 0)} />
              <Caption>Missile, AC, Init</Caption>
              <ChipRow chip="CON" value={c.abilities.con} narrow={fmtMod(conMod)} disabled={!canEdit} onChange={(v) => setAbility("con", Number(v) || 0)} />
              <Caption>Hit points</Caption>
              <ChipRow chip="CHA" value={c.abilities.cha} narrow={fmtMod(chaMod)} disabled={!canEdit} onChange={(v) => setAbility("cha", Number(v) || 0)} />
              <Caption>Reactions, Retainers, Loyalty</Caption>
            </div>
            <div>
              <h3>Saving Throws</h3>
              <Caption>Roll over or equal on 1d20</Caption>
              <ChipRow chip="D" value={c.saves.death} disabled={!canEdit} onChange={(v) => setSave("death", Number(v) || 0)} />
              <Caption>Death, poison</Caption>
              <ChipRow chip="W" value={c.saves.wands} disabled={!canEdit} onChange={(v) => setSave("wands", Number(v) || 0)} />
              <Caption>Magic wands</Caption>
              <ChipRow chip="P" value={c.saves.paralysis} disabled={!canEdit} onChange={(v) => setSave("paralysis", Number(v) || 0)} />
              <Caption>Paralysis, petrification</Caption>
              <ChipRow chip="B" value={c.saves.breath} disabled={!canEdit} onChange={(v) => setSave("breath", Number(v) || 0)} />
              <Caption>Breath attacks</Caption>
              <ChipRow chip="S" value={c.saves.spells} disabled={!canEdit} onChange={(v) => setSave("spells", Number(v) || 0)} />
              <Caption>Spells, rods, staves</Caption>
              <ChipRow chip="&plusmn;" value={fmtMod(wisMod)} disabled />
              <Caption>WIS modifier to saves vs magic</Caption>
            </div>
          </div>

          <div>
            <h3>Combat</h3>
            <Row2>
              <ChipRow chip="HP" value={c.hpCurrent} disabled={!canEdit} onChange={(v) => set("hpCurrent", Number(v) || 0)} />
              <ChipRow chip="Max" value={c.hpMax} disabled={!canEdit} onChange={(v) => set("hpMax", Number(v) || 0)} />
            </Row2>
            <Row2>
              <ChipRow chip="AC" value={c.ac} disabled={!canEdit} onChange={(v) => set("ac", Number(v) || 0)} />
              <ChipRow chip="Att" value={fmtMod(c.attackBonus)} disabled={!canEdit} onChange={(v) => set("attackBonus", Number(v.replace("+", "")) || 0)} />
            </Row2>
            <Row2>
              <Caption>Unarmored: 10 + DEX Modifier ({unarmoredAC(c.abilities.dex)})</Caption>
              <Caption>Attack Bonus</Caption>
            </Row2>
            <Row2>
              <ChipRow chip="Mel" value={fmtMod(c.attackBonus + strMod)} disabled />
              <ChipRow chip="Mis" value={fmtMod(c.attackBonus + dexMod)} disabled />
            </Row2>
            <Row2>
              <Caption>STR mod. to melee att./damage</Caption>
              <Caption>DEX mod. to missile attacks</Caption>
            </Row2>
          </div>

          <div>
            <h3>Weapons</h3>
            <div className="weapon-row weapon-head">
              <span className="caption" style={{ margin: 0 }}>Weapon</span>
              <span className="caption" style={{ margin: 0 }}>Damage</span>
              <span className="caption" style={{ margin: 0, width: 30 }}></span>
            </div>
            {c.weapons.map((w, i) => (
              <div className="weapon-row" key={i}>
                <input className="wname" value={w.name} disabled={!canEdit}
                  onChange={(e) => updateWeapon(i, { name: e.target.value })} />
                <input className="wdmg" value={w.damage} disabled={!canEdit}
                  onChange={(e) => updateWeapon(i, { damage: e.target.value })} />
                <button className="roll-btn" title="Roll attack + damage" onClick={() => doRoll(w)}>&#127922;</button>
              </div>
            ))}
            {canEdit && <button className="btn text" onClick={addWeaponRow}>+ Weapon</button>}
            {rollResult && <p className="roll-result">{rollResult}</p>}
          </div>

        </div>

        <div className="col-right">
          <div className="portrait-box" style={c.portrait ? { backgroundImage: `url('${c.portrait}')` } : undefined}
            onClick={() => canEdit && document.getElementById("portraitInput")?.click()}>
            {!c.portrait && <p className="caption">Character portrait, symbol, description<br />(click to upload, or right-click a token in OBR)</p>}
            {c.portrait && canEdit && (
              <button className="remove-portrait" onClick={(e) => { e.stopPropagation(); onChange({ ...c, portrait: null, linkedTokenId: null }); }}>Remove</button>
            )}
          </div>
          <input type="file" id="portraitInput" accept="image/*" style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => onChange({ ...c, portrait: ev.target?.result as string, linkedTokenId: null });
              reader.readAsDataURL(file);
            }} />

          <div>
            <h3>Encounters</h3>
            <Row2>
              <ChipRow chip="Init" value={fmtMod(c.init)} disabled={!canEdit} onChange={(v) => set("init", Number(v.replace("+", "")) || 0)} />
              <ChipRow chip="&plusmn;" value={fmtMod(c.reaction)} disabled={!canEdit} onChange={(v) => set("reaction", Number(v.replace("+", "")) || 0)} />
            </Row2>
            <Row2><Caption>Initiative</Caption><Caption>Reaction</Caption></Row2>
            <Row2>
              <ChipRow chip="Ret" value={c.maxRetainers} disabled={!canEdit} onChange={(v) => set("maxRetainers", Number(v) || 0)} />
              <ChipRow chip="Loy" value={c.retainerLoyalty} disabled={!canEdit} onChange={(v) => set("retainerLoyalty", Number(v) || 0)} />
            </Row2>
            <Row2><Caption>Max Retainers</Caption><Caption>Retainer Loyalty</Caption></Row2>
          </div>

          <div>
            <h3>Exploration</h3>
            <Caption>(x-in-6)</Caption>
            <Row2>
              <ChipRow chip="LD" value={c.listenDoor} disabled={!canEdit} onChange={(v) => set("listenDoor", v)} />
              <ChipRow chip="OD" value={c.openDoor || strOpenDoors(c.abilities.str)} disabled={!canEdit} onChange={(v) => set("openDoor", v)} />
            </Row2>
            <Row2><Caption>Listen door</Caption><Caption>Open door</Caption></Row2>
            <Row2>
              <ChipRow chip="SD" value={c.secretDoor} disabled={!canEdit} onChange={(v) => set("secretDoor", v)} />
              <ChipRow chip="FT" value={c.findTrap} disabled={!canEdit} onChange={(v) => set("findTrap", v)} />
            </Row2>
            <Row2><Caption>Secret doors</Caption><Caption>Find traps</Caption></Row2>
          </div>

          <div>
            <h3>Movement</h3>
            <Caption>Base mv. rate = 120, unless encumbered</Caption>
            <Row2>
              <ChipRow chip="Ov" value={Math.round((c.baseMove / 5) * 10) / 10} disabled />
              <ChipRow chip="Ex" value={c.baseMove} disabled={!canEdit} onChange={(v) => set("baseMove", Number(v) || 0)} />
            </Row2>
            <ChipRow chip="En" value={Math.round(c.baseMove / 3)} disabled />
          </div>

          <div>
            <h3>Languages</h3>
            <textarea rows={3} value={c.languages} disabled={!canEdit} onChange={(e) => set("languages", e.target.value)} />
            <label className="literate-check">
              <span>Literate</span>
              <input type="checkbox" checked={c.literate} disabled={!canEdit} onChange={(e) => set("literate", e.target.checked)} />
            </label>
          </div>
        </div>
      </div>

      <InventorySection character={c} canEdit={canEdit} onChange={onChange} strTags={strTags} />

      <ClassFeaturesSection character={c} canEdit={canEdit} onChange={onChange} updateSpellLevel={updateSpellLevel} />

      <div className="notes-coins-grid">
        <div className="enc-col" style={{ flex: 2 }}>
          <h3>Other Notes</h3>
          <Caption>Spells, mounts, retainers, areas explored, clues.</Caption>
          <textarea rows={6} value={c.otherNotes} disabled={!canEdit} onChange={(e) => set("otherNotes", e.target.value)} />
        </div>
        <div className="enc-col" style={{ flex: 1 }}>
          <h3>Coins</h3>
          {(["pp", "gp", "ep", "sp", "cp"] as const).map((k) => (
            <ChipRow key={k} chip={k.toUpperCase()} value={c.coins[k]} disabled={!canEdit}
              onChange={(v) => set("coins", { ...c.coins, [k]: Number(v) || 0 })} />
          ))}
        </div>
      </div>

      <div className="footer-xp">
        <ChipRow chip="XP" value={c.xp} disabled={!canEdit} onChange={(v) => set("xp", Number(v) || 0)} />
        <ChipRow chip="Next" value={c.xpNext} disabled={!canEdit} onChange={(v) => set("xpNext", Number(v) || 0)} />
        <ChipRow chip="%" value={c.xpPercent} disabled={!canEdit} onChange={(v) => set("xpPercent", v)} />
      </div>
    </div>
  );
}

function InventorySection({ character: c, canEdit, onChange, strTags }: {
  character: Character; canEdit: boolean; onChange: (c: Character) => void; strTags: string[];
}) {
  const setStd = (k: keyof Character["standardInventory"], v: string) =>
    onChange({ ...c, standardInventory: { ...c.standardInventory, [k]: v } });
  const setUnenc = (v: string) => onChange({ ...c, itemBasedInventory: { ...c.itemBasedInventory, unencumbering: v } });
  const setEquipped = (i: number, v: string) => {
    const arr = [...c.itemBasedInventory.equipped]; arr[i] = v;
    onChange({ ...c, itemBasedInventory: { ...c.itemBasedInventory, equipped: arr } });
  };
  const setPacked = (i: number, v: string) => {
    const arr = [...c.itemBasedInventory.packed]; arr[i] = v;
    onChange({ ...c, itemBasedInventory: { ...c.itemBasedInventory, packed: arr } });
  };

  // Ladder rows: 20 total, labels at rows 8 / 15 / 17 / 19 (0-indexed 7/14/16/18)
  const ladderLabel = (i: number) => {
    if (i === 7) return "120' (40')";
    if (i === 14) return "90' (30')";
    if (i === 16) return "60' (20')";
    if (i === 18) return "30' (10')";
    return "";
  };

  return (
    <div className="inventory-wrap">
      <div className="inventory-header">
        <h3>Inventory</h3>
        <div className="inv-toggle">
          <button className={`inv-tab ${c.inventoryMode === "standard" ? "active" : ""}`} disabled={!canEdit}
            onClick={() => onChange({ ...c, inventoryMode: "standard" })}>Standard</button>
          <button className={`inv-tab ${c.inventoryMode === "item" ? "active" : ""}`} disabled={!canEdit}
            onClick={() => onChange({ ...c, inventoryMode: "item" })}>Item-Based</button>
        </div>
      </div>

      {c.inventoryMode === "standard" ? (
        <div className="inv-grid">
          <div className="inv-box">
            <h4>Equipment</h4>
            <textarea rows={7} value={c.standardInventory.equipment} disabled={!canEdit} onChange={(e) => setStd("equipment", e.target.value)} />
          </div>
          <div className="inv-box">
            <h4>Weapons &amp; Armour</h4>
            <textarea rows={7} value={c.standardInventory.weaponsArmour} disabled={!canEdit} onChange={(e) => setStd("weaponsArmour", e.target.value)} />
          </div>
          <div className="inv-box">
            <h4>Magic Items</h4>
            <textarea rows={7} value={c.standardInventory.magicItems} disabled={!canEdit} onChange={(e) => setStd("magicItems", e.target.value)} />
          </div>
          <div className="inv-box">
            <h4>Treasure</h4>
            <textarea rows={7} value={c.standardInventory.treasure} disabled={!canEdit} onChange={(e) => setStd("treasure", e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="encumbrance-grid">
          <table className="encumbrance-table">
            <colgroup><col style={{ width: "38%" }} /><col style={{ width: 80 }} /><col /></colgroup>
            <tbody>
              <tr className="header-row">
                <td><h3>Unencumbering Items</h3></td>
                <td className="mv-header">Base<br />Mv. Rate</td>
                <td><h3>Packed Items</h3></td>
              </tr>
              <tr>
                <td rowSpan={6} className="unenc-cell">
                  <Caption>Clothing, necklaces, rings, etc. Not encumbering unless carried in large numbers (referee's judgement).</Caption>
                  <textarea rows={3} className="locked" value={c.itemBasedInventory.unencumbering} disabled={!canEdit} onChange={(e) => setUnenc(e.target.value)} />
                </td>
                <td rowSpan={8} className="ladder-cell first-zone">120' (40')</td>
                <td className="packed-cell"><input value={c.itemBasedInventory.packed[0]} disabled={!canEdit} onChange={(e) => setPacked(0, e.target.value)} /><span className="str-tag">{strTags[0]}</span></td>
              </tr>
              {strTags.slice(1).map((tag, idx) => (
                <tr key={tag}>
                  <td className="packed-cell">
                    <input value={c.itemBasedInventory.packed[idx + 1]} disabled={!canEdit} onChange={(e) => setPacked(idx + 1, e.target.value)} />
                    <span className="str-tag">{tag}</span>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="equip-cell">
                  <h3>Equipped Items</h3>
                  <Caption>Anything held, actively in use, or ready to use at short notice: armour worn, shields or weapons held, sheathed weapons, items worn on the belt.</Caption>
                </td>
                <td className="packed-cell"><input value={c.itemBasedInventory.packed[6]} disabled={!canEdit} onChange={(e) => setPacked(6, e.target.value)} /></td>
              </tr>
              {c.itemBasedInventory.equipped.map((val, i) => {
                const packedIdx = 7 + i; // rows 8-13 continue the packed list alongside equipped lines
                const showLadder = packedIdx === 8; // 90' zone starts here (0-indexed 8 = row 9)
                return (
                  <tr key={i}>
                    <td className="equip-cell">
                      <input className="equip-input" value={val} disabled={!canEdit} onChange={(e) => setEquipped(i, e.target.value)} />
                    </td>
                    {showLadder && <td rowSpan={7} className="ladder-cell">90' (30')</td>}
                    <td className="packed-cell"><input value={c.itemBasedInventory.packed[packedIdx]} disabled={!canEdit} onChange={(e) => setPacked(packedIdx, e.target.value)} /></td>
                  </tr>
                );
              })}
              {Array.from({ length: 20 - 15 }).map((_, i) => {
                const packedIdx = 15 + i;
                const label = ladderLabel(packedIdx);
                const needsSpan = packedIdx === 16 || packedIdx === 18;
                return (
                  <tr key={packedIdx}>
                    <td className="equip-cell"></td>
                    {needsSpan && <td rowSpan={2} className="ladder-cell">{label}</td>}
                    <td className="packed-cell"><input value={c.itemBasedInventory.packed[packedIdx]} disabled={!canEdit} onChange={(e) => setPacked(packedIdx, e.target.value)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Caption>Everything else, packed into sacks and backpacks. Retrieving a packed item in combat optionally takes one round.</Caption>
          <Caption>STR modifier (optional): remove slots at the top of the list based on STR score. If not using this rule, remove the top 3 slots.</Caption>
          <Caption>250 coins = 1 item slot.</Caption>
        </div>
      )}
    </div>
  );
}

function ClassFeaturesSection({ character: c, canEdit, onChange, updateSpellLevel }: {
  character: Character; canEdit: boolean; onChange: (c: Character) => void;
  updateSpellLevel: (i: number, patch: Partial<SpellLevel>) => void;
}) {
  const setFeature = (k: keyof Character["classFeatures"], v: boolean) =>
    onChange({ ...c, classFeatures: { ...c.classFeatures, [k]: v } });
  const setThiefSkill = (k: string, v: string) =>
    onChange({ ...c, thiefSkills: { ...c.thiefSkills, [k]: v } });

  return (
    <div className="class-features-wrap">
      <h3>Class Features</h3>
      <div className="class-features">
        <label className="feature-check">
          <input type="checkbox" checked={c.classFeatures.thief} disabled={!canEdit} onChange={(e) => setFeature("thief", e.target.checked)} /> Thief Skills
        </label>
        <label className="feature-check">
          <input type="checkbox" checked={c.classFeatures.turnUndead} disabled={!canEdit} onChange={(e) => setFeature("turnUndead", e.target.checked)} /> Turn Undead
        </label>
        <label className="feature-check">
          <input type="checkbox" checked={c.classFeatures.spells} disabled={!canEdit} onChange={(e) => setFeature("spells", e.target.checked)} /> Spells
        </label>
      </div>

      {c.classFeatures.thief && (
        <div className="feature-block show">
          <h4>Thief Skills (your current values)</h4>
          <Caption>CS Climb Sheer Surfaces &middot; TR Find/Remove Traps &middot; HN Hear Noise &middot; HS Hide in Shadows &middot; MS Move Silently &middot; OL Open Locks &middot; PP Pick Pockets</Caption>
          <div className="thief-grid">
            {THIEF_SKILL_KEYS.map((k) => (
              <ChipRow key={k} chip={k} value={c.thiefSkills[k] || ""} disabled={!canEdit} onChange={(v) => setThiefSkill(k, v)} />
            ))}
          </div>
          <details>
            <summary className="caption">Thief Skills Chance of Success (full table)</summary>
            <ThiefTable />
          </details>
        </div>
      )}

      {c.classFeatures.turnUndead && (
        <div className="feature-block show">
          <h4>Turn Undead</h4>
          <Caption>Hit Dice of Monster Type. T = auto-turn, D = auto-destroy, &mdash; = no effect.</Caption>
          <TurnUndeadTable />
        </div>
      )}

      {c.classFeatures.spells && (
        <div className="feature-block show">
          <h4>Spells</h4>
          <Caption>Type the number of slots for a level; that many check boxes appear. Check one off when it's used.</Caption>
          <div className="spell-grid">
            {c.spellLevels.map((level, i) => (
              <div className="spell-level" key={i}>
                <div className="chip-row">
                  <div className="chip">Lv{i + 1}</div>
                  <div className="box narrow">
                    <input type="number" min={0} max={8} value={level.slots} disabled={!canEdit}
                      onChange={(e) => updateSpellLevel(i, { slots: Math.max(0, Math.min(8, Number(e.target.value) || 0)) })} />
                  </div>
                  <div className="box slot-boxes">
                    {Array.from({ length: level.slots }).map((_, si) => (
                      <input key={si} type="checkbox" checked={si < level.used} disabled={!canEdit}
                        onChange={(e) => {
                          const used = e.target.checked ? Math.max(level.used, si + 1) : Math.min(level.used, si);
                          updateSpellLevel(i, { used });
                        }} />
                    ))}
                  </div>
                </div>
                <textarea rows={1} placeholder="Spells known / memorized at this level" value={level.known} disabled={!canEdit}
                  onChange={(e) => updateSpellLevel(i, { known: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ThiefTable() {
  const rows = [
    [1, 87, 10, "1\u20132", 10, 20, 15, 20], [2, 88, 15, "1\u20132", 15, 25, 20, 25],
    [3, 89, 20, "1\u20133", 20, 25, 30, 30], [4, 90, 25, "1\u20133", 25, 30, 30, 35],
    [5, 91, 30, "1\u20133", 30, 40, 35, 40], [6, 92, 40, "1\u20133", 36, 45, 45, 45],
    [7, 93, 50, "1\u20134", 45, 55, 55, 55], [8, 94, 60, "1\u20134", 55, 65, 65, 65],
    [9, 95, 70, "1\u20134", 65, 75, 75, 75], [10, 96, 80, "1\u20134", 75, 85, 85, 85],
    [11, 97, 90, "1\u20135", 85, 95, 95, 95], [12, 98, 95, "1\u20135", 90, 96, 96, 105],
    [13, 99, 97, "1\u20135", 95, 98, 97, 115], [14, 99, 99, "1\u20135", 99, 99, 99, 125],
  ];
  return (
    <table className="turn-table">
      <thead><tr><th>Level</th><th>CS</th><th>TR</th><th>HN</th><th>HS</th><th>MS</th><th>OL</th><th>PP</th></tr></thead>
      <tbody>
        {rows.map((r) => <tr key={r[0]}>{r.map((v, i) => <td key={i}>{v}</td>)}</tr>)}
      </tbody>
    </table>
  );
}

function TurnUndeadTable() {
  const rows: (string | number)[][] = [
    [1, 7, 9, 11, "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"],
    [2, 7, 9, 11, "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"],
    [3, "T", 7, 9, 11, "\u2014", "\u2014", "\u2014", "\u2014"],
    [4, "D", "T", 7, 9, 11, "\u2014", "\u2014", "\u2014"],
    [5, "D", "D", "T", 7, 9, 11, "\u2014", "\u2014"],
    [6, "D", "D", "D", "T", 7, 9, 11, "\u2014"],
    [7, "D", "D", "D", "D", "T", 7, 9, 11],
    [8, "D", "D", "D", "D", "D", "T", 7, 9],
    [9, "D", "D", "D", "D", "D", "D", "T", 7],
    [10, "D", "D", "D", "D", "D", "D", "D", "T"],
    ["11+", "D", "D", "D", "D", "D", "D", "D", "D"],
  ];
  return (
    <table className="turn-table">
      <thead><tr><th>Lvl</th><th>1</th><th>2</th><th>2*</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7-9</th></tr></thead>
      <tbody>
        {rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}
      </tbody>
    </table>
  );
}
