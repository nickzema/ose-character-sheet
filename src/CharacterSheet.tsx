import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Character, Weapon, MemorizedSpell, BasicInventory, DetailedInventory, WeightedItem, ArmourType } from "./types";
import {
  abilityMod, strOpenDoors, fmtMod, unarmoredAC, thiefSkillsForLevel, turnUndeadForLevel, TURN_UNDEAD_COLUMNS,
  movementTriple, BASIC_MOVEMENT, detailedSpeedForWeight, itemBasedSpeed,
} from "./abilities";
import { rollWeapon, rollNotation, termString } from "./dice";
import { CLERIC_SPELLS, MAGIC_USER_SPELLS } from "./spells";
import HelpButton, { type TourStep } from "./HelpButton";

interface RollState {
  label: string;
  outcome: "success" | "fail" | "neutral";
  rolled?: number;
  target?: number;
  detail?: string; // used for plain text states like "Rolling...", "Cannot be turned", "Auto-Turn!"
  parts?: { label: string; total: number; dice: number[] }[]; // clean multi-row display (weapon attack+damage)
  fallbackNote?: string;
}

type ModalState =
  | { type: "confirm"; message: string; yesLabel?: string; noLabel?: string; resolve: (v: boolean) => void }
  | { type: "prompt"; message: string; defaultValue: string; resolve: (v: number | null) => void }
  | { type: "choice"; message: string; options: string[]; resolve: (v: string | null) => void };

function parseXin6(s: string): number {
  const m = s.match(/^\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

function parseHearNoiseRange(s: string): number {
  const nums = s.match(/\d+/g);
  return nums && nums.length ? parseInt(nums[nums.length - 1], 10) : 1;
}

interface Props {
  character: Character;
  canEdit: boolean;
  isGM: boolean;
  onChange: (c: Character) => void;
  onDelete: () => void;
  onBack: () => void;
}

const SHEET_HELP_STEPS = (isGM: boolean): TourStep[] => {
  const steps: TourStep[] = [
    { text: "Right-click any token and assign it to this Character to connect the Character's portrait, HP, & AC." },
    { selector: '[data-tour="color-swatch"]', text: "Select your preferred sheet color." },
    { selector: '[data-tour="pc-toggle"]', text: "Click this to toggle between PC and NPC." },
    { selector: '[data-tour="roll-chip"]', text: "Click any of your Abilities to perform a roll-under Ability Check." },
    { selector: '[data-tour="save-chip"]', text: "Click any of your Saves to perform a roll-over Saving Throw." },
    { selector: '[data-tour="encounters-zone"]', text: "Select any of these to roll encounter checks for initiative, reactions, hiring, and loyalty." },
    { selector: '[data-tour="exploration-zone"]', text: "Select any of these to perform x-in-6 chance checks." },
    { selector: '[data-tour="hp-roll"]', text: "Select this to roll a single Hit Die." },
    { selector: '[data-tour="max-roll"]', text: "Select this to roll all of your Hit Dice at once." },
    { selector: '[data-tour="mel-roll"]', text: "Select this to roll a straight Melee Attack Check." },
    { selector: '[data-tour="mis-roll"]', text: "Select this to roll a straight Missile Attack Check." },
    { selector: '[data-tour="weapons-heading"]', text: "Add each of your carried weapons below." },
    { selector: '[data-tour="weapon-dmg"]', text: "Input the damage die." },
    { selector: '[data-tour="weapon-type"]', text: "Toggle between Melee and Missile weapon type." },
    { selector: '[data-tour="weapon-roll"]', text: "Click to roll your attack and damage for this weapon." },
    { selector: '[data-tour="movement-zone"]', text: "You can input your Movement Speed manually - however all Inventory systems, with the exception of Item-Based, will update your Movement Speed for you automatically." },
    { selector: '.inv-toggle', text: "Select which type of Encumbrance system you'll use for this Character. Basic: quick freeform lists, movement set purely by armour worn and treasure. Basic+: the same armour-driven movement as Basic, with organized weighted lists instead of free text. Detailed: tracks exact coin-weight to calculate movement precisely. Item-Based: counts equipped and packed items instead of weight, for a simpler at-the-table count." },
    { selector: '.class-features', text: "Select any features related to your Character's class." },
    { selector: '[data-tour="xp-roll"]', text: "Enter your total Experience Points." },
    { selector: '[data-tour="next-roll"]', text: "Enter the number of Experience Points needed to reach the next Level." },
    { selector: '[data-tour="percent-roll"]', text: "Enter the Experience Points percentage boost based on your Character's statistics." },
  ];
  if (isGM) {
    steps.push({ selector: '[data-tour="hide-toggle"]', text: "GM only: hides this character so players can't see them at all." });
  }
  return steps;
};

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
const THIEF_SKILL_NAMES: Record<string, string> = {
  CS: "Climb Sheer Surfaces",
  TR: "Find/Remove Traps",
  HN: "Hear Noise",
  HS: "Hide in Shadows",
  MS: "Move Silently",
  OL: "Open Locks",
  PP: "Pick Pockets",
};

function ChipRow({ chip, value, onChange, disabled, narrow, width, onRoll, rollTitle, unit, tourId }: {
  chip: string; value: string | number; onChange?: (v: string) => void;
  disabled?: boolean; narrow?: string; width?: string; onRoll?: () => void; rollTitle?: string; unit?: string; tourId?: string;
}) {
  return (
    <div className="chip-row" style={width ? { flex: `0 0 ${width}` } : undefined}>
      {onRoll ? (
        <button className="chip rollable" data-tour={tourId} onClick={onRoll} data-tip={rollTitle || "Click to roll"}>{chip}</button>
      ) : (
        <div className="chip" data-tour={tourId}>{chip}</div>
      )}
      <div className="box">
        <input value={value} disabled={disabled} onChange={(e) => onChange?.(e.target.value)} />
        {unit && <span className="box-unit">{unit}</span>}
      </div>
      {narrow !== undefined && (
        <div className="box narrow"><input value={narrow} disabled readOnly /></div>
      )}
    </div>
  );
}

function RollBanner({ roll, onDismiss }: { roll: RollState | null; onDismiss: () => void }) {
  if (!roll) return null;
  const showOutcome = roll.rolled !== undefined && roll.outcome !== "neutral";
  return (
    <div className={`roll-banner ${roll.outcome}`}>
      <button className="roll-dismiss" onClick={onDismiss} data-tip="Dismiss">&times;</button>
      <div className="roll-label">{roll.label}</div>
      {roll.parts ? (
        <div className="roll-parts">
          {roll.parts.map((p, i) => (
            <div className="roll-part" key={i}>
              <span className="roll-part-label">{p.label}</span>
              <span className="roll-part-total">{p.total}</span>
              {p.dice.length > 0 && <span className="roll-part-dice">[{p.dice.join(", ")}]</span>}
            </div>
          ))}
        </div>
      ) : roll.rolled !== undefined ? (
        <div className="roll-numbers">
          {roll.rolled}
          {roll.target !== undefined && <><span className="vs">vs</span>{roll.target}</>}
        </div>
      ) : (
        <div className="roll-detail-text">{roll.detail}</div>
      )}
      {showOutcome && (
        <div className={`roll-outcome ${roll.outcome}`}>
          {roll.outcome === "success" ? <>&#10003; SUCCESS</> : <>&#10007; FAIL</>}
        </div>
      )}
      {roll.fallbackNote && <div className="roll-fallback-note">{roll.fallbackNote}</div>}
    </div>
  );
}

function AppModal({ state }: { state: ModalState }) {
  const [inputVal, setInputVal] = useState(state.type === "prompt" ? state.defaultValue : "");

  return (
    <div className="modal-backdrop" onClick={() => state.type === "confirm" ? state.resolve(false) : state.type === "prompt" ? state.resolve(null) : state.resolve(null)}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <p className="modal-message">{state.message}</p>
        {state.type === "prompt" && (
          <input
            type="number"
            className="modal-input"
            value={inputVal}
            autoFocus
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") state.resolve(parseInt(inputVal, 10) || 0); }}
          />
        )}
        <div className="modal-actions">
          {state.type === "confirm" ? (
            <>
              <button className="btn modal-btn" onClick={() => state.resolve(true)}>{state.yesLabel || "Yes"}</button>
              <button className="btn text modal-btn" onClick={() => state.resolve(false)}>{state.noLabel || "No"}</button>
            </>
          ) : state.type === "prompt" ? (
            <>
              <button className="btn modal-btn" onClick={() => state.resolve(parseInt(inputVal, 10) || 0)}>Roll</button>
              <button className="btn text modal-btn" onClick={() => state.resolve(null)}>Cancel</button>
            </>
          ) : (
            <>
              {state.options.map((opt) => (
                <button key={opt} className="btn modal-btn" onClick={() => state.resolve(opt)}>{opt}</button>
              ))}
              <button className="btn text modal-btn" onClick={() => state.resolve(null)}>Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div className="row-2">{children}</div>;
}

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="caption">{children}</p>;
}

// The textarea here is sized in JS, not CSS, on purpose: it sits inside a
// rowSpan'd table cell whose real height comes from Packed's 10 rows next
// to it, and percentage/flex heights don't reliably resolve against a
// rowSpan'd cell's actual rendered height across browsers (confirmed by
// testing - the standard "height:1px" trick for this doesn't hold up
// here). Measuring the cell's real clientHeight directly sidesteps that
// entirely and re-measures via ResizeObserver if anything changes it.
// 10 Packed rows at .ib-input-cell's fixed CSS height (23px content + 4px
// bottom padding + ~1px border ~= 23.8px), measured directly in a real
// browser render. This is a constant, not a live measurement, on
// purpose: the previous version measured the merged cell's own
// rendered height with a ResizeObserver, but that cell's height is
// ITSELF driven by the textarea inside it (nothing else constrains a
// rowSpan'd cell's height) - so growing the textarea grew the cell,
// which retriggered the observer, which grew the textarea again: an
// unbounded feedback loop, which is what was "infinitely expanding."
// Measuring only `other` below (the captions/heading, whose natural
// size the textarea can't affect) breaks that cycle for good.
const UNENC_TARGET_HEIGHT = 238;

function UnencumberingCell({ value, canEdit, onChange }: { value: string; canEdit: boolean; onChange: (v: string) => void }) {
  const otherRef = useRef<HTMLDivElement>(null);
  const [taHeight, setTaHeight] = useState(80);

  useEffect(() => {
    const other = otherRef.current;
    if (!other) return;
    const recalc = () => setTaHeight(Math.max(UNENC_TARGET_HEIGHT - other.scrollHeight - 4, 60));
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(other);
    return () => ro.disconnect();
  }, []);

  return (
    <td rowSpan={10} className="unenc-cell">
      <div className="unenc-cell-inner">
        <textarea
          style={{ height: taHeight }}
          value={value} disabled={!canEdit} onChange={(e) => onChange(e.target.value)}
        />
        <div ref={otherRef}>
          <Caption>Clothing, necklaces, rings, etc. Not encumbering unless carried in large numbers (referee's judgement). Doesn't affect movement.</Caption>
          <h4>Equipped Items</h4>
          <Caption>Anything held, actively in use, or ready to use at short notice: armour worn, shields or weapons held, sheathed weapons, items worn on the belt.</Caption>
        </div>
      </div>
    </td>
  );
}

export default function CharacterSheet({ character: c, canEdit, isGM, onChange, onDelete, onBack }: Props) {
  const [colorOpen, setColorOpen] = useState(false);
  const [portraitUrlDraft, setPortraitUrlDraft] = useState("");

  const set = <K extends keyof Character>(key: K, value: Character[K]) => onChange({ ...c, [key]: value });
  const setAbility = (k: keyof Character["abilities"], v: number) => onChange({ ...c, abilities: { ...c.abilities, [k]: v } });
  const setSave = (k: keyof Character["saves"], v: number) => onChange({ ...c, saves: { ...c.saves, [k]: v } });

  const strMod = abilityMod(c.abilities.str);
  const intMod = abilityMod(c.abilities.int);
  const dexMod = abilityMod(c.abilities.dex);
  const wisMod = abilityMod(c.abilities.wis);
  const conMod = abilityMod(c.abilities.con);
  const chaMod = abilityMod(c.abilities.cha);

  const [roll, setRoll] = useState<RollState | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  // Auto-dismiss the roll result banner after a few seconds so it doesn't
  // sit there forever waiting to be clicked away - but not while it's
  // still showing the "Rolling..." placeholder, since that state gets
  // replaced by the real result a moment later anyway.
  useEffect(() => {
    if (!roll || roll.detail === "Rolling...") return;
    const timer = setTimeout(() => setRoll(null), 6000);
    return () => clearTimeout(timer);
  }, [roll]);

  const askYesNo = (message: string, yesLabel?: string, noLabel?: string) =>
    new Promise<boolean>((resolve) => {
      setModal({ type: "confirm", message, yesLabel, noLabel, resolve: (v) => { setModal(null); resolve(v); } });
    });

  const askNumber = (message: string, defaultValue = "0") =>
    new Promise<number | null>((resolve) => {
      setModal({ type: "prompt", message, defaultValue, resolve: (v) => { setModal(null); resolve(v); } });
    });

  const askHitDie = () =>
    new Promise<string | null>((resolve) => {
      setModal({ type: "choice", message: "Hit Die?", options: ["d4", "d6", "d8"], resolve: (v) => { setModal(null); resolve(v); } });
    });

  const fallbackNoteFor = (reason?: "not-detected" | "timeout") => {
    if (!reason) return undefined;
    return reason === "timeout"
      ? "Dice+ didn't respond in time \u2014 this is a local roll, not Dice+'s result."
      : "Dice+ not detected in this room \u2014 local roll.";
  };

  const rollAndShow = async (
    label: string,
    notation: string,
    interpret: (total: number) => { outcome: RollState["outcome"]; rolled?: number; target?: number; detail?: string }
  ) => {
    setRoll({ label, detail: "Rolling...", outcome: "neutral" });
    const { total, usedFallback, fallbackReason } = await rollNotation(notation);
    setRoll({ label, ...interpret(total), fallbackNote: usedFallback ? fallbackNoteFor(fallbackReason) : undefined });
    return total;
  };

  // STR/INT/WIS/DEX/CON/CHA: 1d20, success on a roll <= the score itself.
  const rollAbility = (abbr: string, score: number) =>
    rollAndShow(`${abbr} Check`, "1d20", (total) => ({
      rolled: total, target: score, outcome: total <= score ? "success" : "fail",
    }));

  // Saving throws: 1d20 (+WIS mod if vs. magic), success on a roll >= the save value.
  // Wands and Spells/Rods/Staves are always magical - no prompt, WIS mod always applies.
  // Death, Paralysis, and Breath prompt first since those aren't always magical.
  const rollSave = async (label: string, value: number, alwaysMagic: boolean, askMagic: boolean) => {
    let vsMagic = alwaysMagic;
    if (askMagic) {
      vsMagic = await askYesNo(`Add WIS modifier to Saves vs. Magic? (${fmtMod(wisMod)})`);
    }
    const mod = vsMagic ? wisMod : 0;
    const notation = mod !== 0 ? `1d20${mod >= 0 ? "+" : ""}${mod}` : "1d20";
    await rollAndShow(`${label} Save`, notation, (total) => ({
      rolled: total, target: value, outcome: total >= value ? "success" : "fail",
    }));
  };

  const rollInit = () => rollAndShow("Initiative", `1d6${dexMod >= 0 ? "+" : ""}${dexMod}`, (total) => ({
    rolled: total, outcome: "neutral",
  }));

  const rollReaction = (label: string) =>
    rollAndShow(label, `2d6${chaMod >= 0 ? "+" : ""}${chaMod}`, (total) => ({
      rolled: total, outcome: "neutral",
    }));

  // Loyalty: 2d6, success on a roll <= the loyalty value (a morale-style check).
  const rollLoyalty = () =>
    rollAndShow("Loyalty", "2d6", (total) => ({
      rolled: total, target: c.retainerLoyalty, outcome: total <= c.retainerLoyalty ? "success" : "fail",
    }));

  // Exploration x-in-6 checks: 1d6, success on a roll <= the threshold.
  const rollXin6 = (label: string, thresholdText: string) => {
    const threshold = parseXin6(thresholdText);
    return rollAndShow(label, "1d6", (total) => ({
      rolled: total, target: threshold, outcome: total <= threshold ? "success" : "fail",
    }));
  };

  const rollMelMis = (label: string, mod: number) =>
    rollAndShow(label, `1d20${termString([c.attackBonus, mod])}`, (total) => ({
      rolled: total, outcome: "neutral",
    }));

  // HP roll: one Hit Die + CON mod. Never writes into hpCurrent - shown in
  // the banner only, so a player can't accidentally wipe out a value they
  // meant to keep by clicking the wrong thing.
  const rollHP = async () => {
    const hd = await askHitDie();
    if (!hd) return;
    await rollAndShow("HP Roll", `1${hd}${termString([conMod])}`, (total) => ({
      rolled: total, outcome: "neutral",
    }));
  };

  // Max HP roll: one Hit Die + CON mod per level, up to level 9. Past 9th
  // level, OSE characters stop rolling extra Hit Dice - each level beyond
  // 9 just adds a flat +2 HP, no CON bonus. Also never writes into hpMax.
  const rollMaxHP = async () => {
    const hd = await askHitDie();
    if (!hd) return;
    const rolledLevels = Math.min(c.level, 9);
    const flatLevels = Math.max(c.level - 9, 0);
    const flatBonus = flatLevels * 2;
    const notation = `${rolledLevels}${hd}${termString([conMod * rolledLevels, flatBonus])}`;
    await rollAndShow(`Max HP Roll (Lv${c.level})`, notation, (total) => ({
      rolled: total, outcome: "neutral",
    }));
  };

  // Thief skills: percentage skills are d100 roll-under; Hear Noise is x-in-6.
  const rollThiefSkill = (key: string, displayValue: string) => {
    const label = THIEF_SKILL_NAMES[key] || key;
    if (key === "HN") return rollXin6(label, `${parseHearNoiseRange(displayValue)}-in-6`);
    const pct = parseInt(displayValue, 10) || 0;
    return rollAndShow(label, "1d100", (total) => ({
      rolled: total, target: pct, outcome: total <= pct ? "success" : "fail",
    }));
  };

  // Turn Undead: click the HD column matching what's actually being faced.
  // T/D resolve instantly (no roll); a number prompts for a modifier, rolls
  // 2d6+mod against that specific target, then a follow-up 2d6 on success
  // shows HD turned; "\u2014" means it can never be turned.
  const rollTurnUndead = async (col: string, value: string | number) => {
    if (value === "\u2014") {
      setRoll({ label: `Turn Undead (HD ${col})`, detail: "Cannot be turned", outcome: "fail" });
      return;
    }
    if (value === "T" || value === "D") {
      // Auto-turn/destroy skips the 2d6-vs-target roll entirely (there's
      // nothing to beat), but still needs the follow-up roll for how much
      // HD it affects - no announcement first, just roll it immediately.
      const verb = value === "T" ? "turns" : "destroys";
      const { total: hdTotal, usedFallback, fallbackReason } = await rollNotation("2d6");
      setRoll({
        label: `Turn Undead (HD ${col})`, outcome: "success",
        detail: `Auto-${value === "T" ? "Turn" : "Destroy"} \u2014 ${verb} ${hdTotal} HD worth of undead`,
        fallbackNote: usedFallback ? fallbackNoteFor(fallbackReason) : undefined,
      });
      return;
    }
    const target = value as number;
    const mod = await askNumber("Any situational modifier to this Turn Undead check?", "0");
    if (mod === null) return;
    const notation = mod !== 0 ? `2d6${mod >= 0 ? "+" : ""}${mod}` : "2d6";
    const total = await rollAndShow(`Turn Undead (HD ${col})`, notation, (t) => ({
      rolled: t, target, outcome: t >= target ? "success" : "fail",
    }));
    if (total >= target) {
      const { total: hdTotal, usedFallback, fallbackReason } = await rollNotation("2d6");
      setRoll({
        label: `Turn Undead (HD ${col})`, outcome: "success",
        detail: `Success \u2014 turns ${hdTotal} HD worth of undead`,
        fallbackNote: usedFallback ? fallbackNoteFor(fallbackReason) : undefined,
      });
    }
  };

  const doRoll = async (weapon: Weapon) => {
    setRoll({ label: weapon.name || "Weapon", detail: "Rolling...", outcome: "neutral" });
    const hitAbilityMod = weapon.ranged ? dexMod : strMod;
    const dmgMod = weapon.ranged ? 0 : strMod; // only STR/melee adds to damage - never the attack bonus or DEX
    const magicBonus = parseInt(weapon.bonus, 10) || 0; // magic weapon bonus applies to both attack and damage
    const { parts, usedFallback, fallbackReason } = await rollWeapon(weapon.name, weapon.damage, c.attackBonus, hitAbilityMod, dmgMod, magicBonus);
    setRoll({
      label: weapon.name || "Weapon", parts, outcome: "neutral",
      fallbackNote: usedFallback ? fallbackNoteFor(fallbackReason) : undefined,
    });
  };

  const updateWeapon = (i: number, patch: Partial<Weapon>) => {
    const weapons = c.weapons.map((w, idx) => (idx === i ? { ...w, ...patch } : w));
    set("weapons", weapons);
  };
  const addWeaponRow = () => set("weapons", [...c.weapons, { name: "", damage: "", bonus: "", ranged: false }]);
  const [weaponDragIndex, setWeaponDragIndex] = useState<number | null>(null);
  const [weaponOverIndex, setWeaponOverIndex] = useState<number | null>(null);
  const dropWeapon = (i: number) => {
    if (weaponDragIndex === null || weaponDragIndex === i) { setWeaponOverIndex(null); return; }
    set("weapons", reorder(c.weapons, weaponDragIndex, i));
    setWeaponDragIndex(null);
    setWeaponOverIndex(null);
  };

  const strTags = ["STR 18+", "STR 16+", "STR 13+", "STR 9+", "STR 6+", "STR 4+"];

  return (
    <div className="sheet-view" style={{ background: c.color }}>
      <div className="sheet-topbar">
        <button className="btn text" onClick={onBack}>&larr; All characters</button>
        <div className="sheet-topbar-right">
          <HelpButton title="How this sheet works" steps={SHEET_HELP_STEPS(isGM)} />
          {isGM && (
            <button
              className={`btn text ${c.hidden ? "hidden-active" : ""}`}
              data-tour="hide-toggle"
              data-tip={c.hidden ? "Visible only to you \u2014 click to reveal to players" : "Hide from players"}
              onClick={() => set("hidden", !c.hidden)}
            >
              {c.hidden ? "\u{1F441}\uFE0F\u200D\u{1F5E8}\uFE0F Hidden" : "\u{1F441}\uFE0F Hide"}
            </button>
          )}
          {canEdit && <button className="btn text danger" onClick={onDelete}>Delete</button>}
        </div>
      </div>

      <div className="color-picker">
        <button className="color-current" data-tour="color-swatch" style={{ background: c.color }} onClick={() => setColorOpen((o) => !o)} disabled={!canEdit} />
        {!colorOpen && (
          <span className="color-label" onClick={() => canEdit && setColorOpen(true)}>Sheet Color</span>
        )}
        <div className={`color-options ${colorOpen ? "open" : ""}`}>
          {SWATCHES.map(([hex, name]) => (
            <button key={hex} className="swatch" style={{ background: hex }} data-tip={name}
              onMouseEnter={() => onChange({ ...c, color: hex })}
              onClick={() => setColorOpen(false)} />
          ))}
        </div>
      </div>

      <RollBanner roll={roll} onDismiss={() => setRoll(null)} />
      {modal && <AppModal state={modal} />}

      <div className="sheet-grid">
        <div className="col-left">

          <div className="name-row">
            <div className="chip-row">
              <button className="chip chip-toggle" disabled={!canEdit} data-tour="pc-toggle"
                data-tip="Click to toggle PC / NPC"
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
              <ChipRow chip="STR" value={c.abilities.str} narrow={fmtMod(strMod)} disabled={!canEdit} onChange={(v) => setAbility("str", Number(v) || 0)} onRoll={() => rollAbility("STR", c.abilities.str)} rollTitle="Roll STR check (1d20 vs score)" tourId="roll-chip" />
              <Caption>Melee, Open doors {strOpenDoors(c.abilities.str)}</Caption>
              <ChipRow chip="INT" value={c.abilities.int} narrow={fmtMod(intMod)} disabled={!canEdit} onChange={(v) => setAbility("int", Number(v) || 0)} onRoll={() => rollAbility("INT", c.abilities.int)} rollTitle="Roll INT check (1d20 vs score)" />
              <Caption>Languages, Literacy</Caption>
              <ChipRow chip="WIS" value={c.abilities.wis} narrow={fmtMod(wisMod)} disabled={!canEdit} onChange={(v) => setAbility("wis", Number(v) || 0)} onRoll={() => rollAbility("WIS", c.abilities.wis)} rollTitle="Roll WIS check (1d20 vs score)" />
              <Caption>Saves vs magic</Caption>
              <ChipRow chip="DEX" value={c.abilities.dex} narrow={fmtMod(dexMod)} disabled={!canEdit} onChange={(v) => setAbility("dex", Number(v) || 0)} onRoll={() => rollAbility("DEX", c.abilities.dex)} rollTitle="Roll DEX check (1d20 vs score)" />
              <Caption>Missile, AC, Init</Caption>
              <ChipRow chip="CON" value={c.abilities.con} narrow={fmtMod(conMod)} disabled={!canEdit} onChange={(v) => setAbility("con", Number(v) || 0)} onRoll={() => rollAbility("CON", c.abilities.con)} rollTitle="Roll CON check (1d20 vs score)" />
              <Caption>Hit points</Caption>
              <ChipRow chip="CHA" value={c.abilities.cha} narrow={fmtMod(chaMod)} disabled={!canEdit} onChange={(v) => setAbility("cha", Number(v) || 0)} onRoll={() => rollAbility("CHA", c.abilities.cha)} rollTitle="Roll CHA check (1d20 vs score)" />
              <Caption>Reactions, Retainers, Loyalty</Caption>
            </div>
            <div>
              <h3>Saving Throws</h3>
              <Caption>Roll over or equal on 1d20</Caption>
              <ChipRow chip="D" value={c.saves.death} disabled={!canEdit} onChange={(v) => setSave("death", Number(v) || 0)} onRoll={() => rollSave("Death", c.saves.death, false, true)} rollTitle="Roll Death save" tourId="save-chip" />
              <Caption>Death, poison</Caption>
              <ChipRow chip="W" value={c.saves.wands} disabled={!canEdit} onChange={(v) => setSave("wands", Number(v) || 0)} onRoll={() => rollSave("Wands", c.saves.wands, true, false)} rollTitle="Roll Wands save (always vs. magic)" />
              <Caption>Magic wands</Caption>
              <ChipRow chip="P" value={c.saves.paralysis} disabled={!canEdit} onChange={(v) => setSave("paralysis", Number(v) || 0)} onRoll={() => rollSave("Paralysis", c.saves.paralysis, false, true)} rollTitle="Roll Paralysis save" />
              <Caption>Paralysis, petrification</Caption>
              <ChipRow chip="B" value={c.saves.breath} disabled={!canEdit} onChange={(v) => setSave("breath", Number(v) || 0)} onRoll={() => rollSave("Breath", c.saves.breath, false, true)} rollTitle="Roll Breath save" />
              <Caption>Breath attacks</Caption>
              <ChipRow chip="S" value={c.saves.spells} disabled={!canEdit} onChange={(v) => setSave("spells", Number(v) || 0)} onRoll={() => rollSave("Spells", c.saves.spells, true, false)} rollTitle="Roll Spells save (always vs. magic)" />
              <Caption>Spells, rods, staves</Caption>
              <ChipRow chip="&plusmn;" value={fmtMod(wisMod)} disabled />
              <Caption>WIS modifier to saves vs magic</Caption>
            </div>
          </div>

          <div>
            <h3>Combat</h3>
            <Row2>
              <ChipRow chip="HP" value={c.hpCurrent} disabled={!canEdit} onChange={(v) => set("hpCurrent", Number(v) || 0)} onRoll={rollHP} rollTitle="Roll 1 Hit Die + CON (doesn't change this box)" tourId="hp-roll" />
              <ChipRow chip="Max" value={c.hpMax} disabled={!canEdit} onChange={(v) => set("hpMax", Number(v) || 0)} onRoll={rollMaxHP} rollTitle="Roll all Hit Dice for your level + CON (doesn't change this box)" tourId="max-roll" />
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
              <ChipRow chip="Mel" value={fmtMod(strMod)} disabled onRoll={() => rollMelMis("Melee Attack", strMod)} rollTitle="Roll d20 + Att + STR" tourId="mel-roll" />
              <ChipRow chip="Mis" value={fmtMod(dexMod)} disabled onRoll={() => rollMelMis("Missile Attack", dexMod)} rollTitle="Roll d20 + Att + DEX" tourId="mis-roll" />
            </Row2>
            <Row2>
              <Caption>STR mod. to melee att./damage</Caption>
              <Caption>DEX mod. to missile attacks</Caption>
            </Row2>
          </div>

          <div>
            <h3 data-tour="weapons-heading">Weapons</h3>
            <div className="weapon-row weapon-head">
              <span className="mem-head-spacer" />
              <span className="caption" style={{ margin: 0, flex: 1 }}>Weapon</span>
              <span className="caption" style={{ margin: 0, width: 56, textAlign: "center" }}>Damage</span>
              <span className="caption" style={{ margin: 0, width: 40, textAlign: "center" }}>Bonus</span>
              <span className="caption" style={{ margin: 0, width: 52 }}></span>
              <span className="caption" style={{ margin: 0, width: 48 }}></span>
            </div>
            {c.weapons.map((w, i) => (
              <div className={`weapon-row ${weaponDragIndex === i ? "dragging" : ""} ${weaponOverIndex === i && weaponDragIndex !== i ? "drag-over" : ""}`} key={i}
                onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); setWeaponOverIndex(i); }}
                onDragLeave={() => setWeaponOverIndex((cur) => (cur === i ? null : cur))}
                onDrop={() => canEdit && dropWeapon(i)}>
                {canEdit ? (
                  <span draggable onDragStart={() => setWeaponDragIndex(i)} onDragEnd={() => { setWeaponDragIndex(null); setWeaponOverIndex(null); }}>
                    <DragHandle />
                  </span>
                ) : <span className="mem-head-spacer" />}
                <input className="wname" value={w.name} placeholder="Judgement (Warhammer)" disabled={!canEdit}
                  onChange={(e) => updateWeapon(i, { name: e.target.value })} />
                <input className="wdmg" value={w.damage} placeholder="1d6" disabled={!canEdit} data-tour={i === 0 ? "weapon-dmg" : undefined}
                  onChange={(e) => updateWeapon(i, { damage: e.target.value })} />
                <input className="wbonus" value={w.bonus} placeholder="+0" disabled={!canEdit}
                  onChange={(e) => updateWeapon(i, { bonus: e.target.value })} />
                <button className={`weapon-type-btn ${w.ranged ? "ranged" : ""}`} disabled={!canEdit} data-tour={i === 0 ? "weapon-type" : undefined}
                  data-tip="Toggle melee/missile" onClick={() => updateWeapon(i, { ranged: !w.ranged })}>
                  {w.ranged ? "MIS" : "MEL"}
                </button>
                <button className="roll-btn atk-btn" data-tour={i === 0 ? "weapon-roll" : undefined} data-tip="Roll attack + damage" onClick={() => doRoll(w)}>ATK</button>
              </div>
            ))}
            {canEdit && <button className="btn text btn-add" onClick={addWeaponRow}>+ Weapon</button>}
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
          {canEdit && (
            <div className="portrait-url-row">
              <input type="text" placeholder="or paste an image URL" value={portraitUrlDraft}
                onChange={(e) => setPortraitUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && portraitUrlDraft.trim()) {
                    onChange({ ...c, portrait: portraitUrlDraft.trim(), linkedTokenId: null });
                    setPortraitUrlDraft("");
                  }
                }} />
              <button className="btn text" disabled={!portraitUrlDraft.trim()}
                onClick={() => { onChange({ ...c, portrait: portraitUrlDraft.trim(), linkedTokenId: null }); setPortraitUrlDraft(""); }}>Set</button>
            </div>
          )}

          <div data-tour="encounters-zone">
            <h3>Encounters</h3>
            <Row2>
              <ChipRow chip="Init" value={fmtMod(dexMod)} disabled onRoll={rollInit} rollTitle="Roll 1d6 + DEX" />
              <ChipRow chip="&plusmn;" value={fmtMod(chaMod)} disabled onRoll={() => rollReaction("Reaction")} rollTitle="Roll 2d6 + CHA" />
            </Row2>
            <Row2><Caption>Initiative</Caption><Caption>Reaction</Caption></Row2>
            <Row2>
              <ChipRow chip="Ret" value={c.maxRetainers} disabled={!canEdit} onChange={(v) => set("maxRetainers", Number(v) || 0)} onRoll={() => rollReaction("Retainer Reaction")} rollTitle="Roll 2d6 + CHA" />
              <ChipRow chip="Loy" value={c.retainerLoyalty} disabled={!canEdit} onChange={(v) => set("retainerLoyalty", Number(v) || 0)} onRoll={rollLoyalty} rollTitle="Roll 2d6 vs Loyalty" />
            </Row2>
            <Row2><Caption>Max Retainers</Caption><Caption>Retainer Loyalty</Caption></Row2>
          </div>

          <div data-tour="exploration-zone">
            <h3>Exploration</h3>
            <Caption>(x-in-6)</Caption>
            <Row2>
              <ChipRow chip="LD" value={c.listenDoor} disabled={!canEdit} onChange={(v) => set("listenDoor", v)} onRoll={() => rollXin6("Listen Door", c.listenDoor)} rollTitle="Roll 1d6 vs threshold" />
              <ChipRow chip="OD" value={c.openDoor || strOpenDoors(c.abilities.str)} disabled={!canEdit} onChange={(v) => set("openDoor", v)} onRoll={() => rollXin6("Open Door", c.openDoor || strOpenDoors(c.abilities.str))} rollTitle="Roll 1d6 vs threshold" />
            </Row2>
            <Row2><Caption>Listen door</Caption><Caption>Open door</Caption></Row2>
            <Row2>
              <ChipRow chip="SD" value={c.secretDoor} disabled={!canEdit} onChange={(v) => set("secretDoor", v)} onRoll={() => rollXin6("Secret Door", c.secretDoor)} rollTitle="Roll 1d6 vs threshold" />
              <ChipRow chip="FT" value={c.findTrap} disabled={!canEdit} onChange={(v) => set("findTrap", v)} onRoll={() => rollXin6("Find Trap", c.findTrap)} rollTitle="Roll 1d6 vs threshold" />
            </Row2>
            <Row2><Caption>Secret doors</Caption><Caption>Find traps</Caption></Row2>
          </div>

          <div data-tour="movement-zone">
            <h3>Movement</h3>
            <Caption>Base mv. rate = 120, unless encumbered</Caption>
            <Row2>
              <ChipRow chip="Ov" value={c.overlandMove} unit="mi" disabled={!canEdit} onChange={(v) => set("overlandMove", Number(v) || 0)} />
              <ChipRow chip="Ex" value={c.baseMove} unit="ft" disabled={!canEdit} onChange={(v) => set("baseMove", Number(v) || 0)} />
            </Row2>
            <ChipRow chip="En" value={c.encounterMove} unit="ft" disabled={!canEdit} onChange={(v) => set("encounterMove", Number(v) || 0)} />
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

      <ClassFeaturesSection character={c} canEdit={canEdit} onChange={onChange}
        onRollThiefSkill={rollThiefSkill} onRollTurnUndead={rollTurnUndead} />

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
              onChange={(v) => {
                const coins = { ...c.coins, [k]: Number(v) || 0 };
                // Coins are weight too (1cn each, any denomination) - if
                // Detailed is the active mode, editing the purse here has
                // to recompute movement the same way editing an item
                // would, or the Movement section would show a stale speed
                // until some other edit happened to trigger a recalc.
                if (c.inventoryMode === "detailed") {
                  const newCoinWeight = coins.pp + coins.gp + coins.ep + coins.sp + coins.cp;
                  const itemTotal = (["equipment", "weaponsArmour", "magicItems", "treasure"] as const)
                    .reduce((sum, key) => sum + c.detailedInventory[key].reduce((s, it) => s + (it.weight || 0), 0), 0);
                  const { overland, exploration, encounter } = movementTriple(detailedSpeedForWeight(itemTotal + newCoinWeight));
                  onChange({ ...c, coins, baseMove: exploration, overlandMove: overland, encounterMove: encounter });
                } else {
                  onChange({ ...c, coins });
                }
              }} />
          ))}
        </div>
      </div>

      <div className="footer-xp">
        <ChipRow chip="XP" value={c.xp} disabled={!canEdit} onChange={(v) => set("xp", Number(v) || 0)} tourId="xp-roll" />
        <ChipRow chip="Next" value={c.xpNext} disabled={!canEdit} onChange={(v) => set("xpNext", Number(v) || 0)} tourId="next-roll" />
        <ChipRow chip="%" value={c.xpPercent} disabled={!canEdit} onChange={(v) => set("xpPercent", v)} tourId="percent-roll" />
      </div>

      <div className="brand-footer">
        <img src="/zemaria-icon.png" alt="" />
        <span>Another Zemaria product</span>
      </div>
    </div>
  );
}

function InventorySection({ character: c, canEdit, onChange, strTags }: {
  character: Character; canEdit: boolean; onChange: (c: Character) => void; strTags: string[];
}) {
  const applyMovement = (base: number, patch: Partial<Character> = {}) => {
    const { overland, exploration, encounter } = movementTriple(base);
    onChange({ ...c, ...patch, baseMove: exploration, overlandMove: overland, encounterMove: encounter });
  };

  // Every coin weighs 1cn regardless of denomination (OSE: "Coin (any
  // type) - 1"), so the coin purse's contribution to weight is just the
  // sum of how many coins are in it, full stop. Editing the actual coin
  // amounts happens in the Coins section (main component) now, not here -
  // see its onChange for the matching Detailed-movement recalculation.
  const coinWeight = c.coins.pp + c.coins.gp + c.coins.ep + c.coins.sp + c.coins.cp;

  const setBasic = (k: keyof BasicInventory, v: string | boolean) => {
    const basicInventory = { ...c.basicInventory, [k]: v };
    if (k === "armourType" || k === "carryingTreasure") {
      const armourType = (k === "armourType" ? v : c.basicInventory.armourType) as ArmourType;
      const withTreasure = (k === "carryingTreasure" ? v : c.basicInventory.carryingTreasure) as boolean;
      const base = BASIC_MOVEMENT[armourType][withTreasure ? "with" : "without"];
      applyMovement(base, { basicInventory });
    } else {
      onChange({ ...c, basicInventory });
    }
  };

  // Basic+: same armour-driven movement as Basic, but with Detailed's
  // Basic+ deliberately does NOT have its own storage: its armour/treasure
  // selection IS Basic's (setBasic, defined above) so switching between
  // Basic and Basic+ doesn't reset your choice, and its item lists ARE
  // Detailed's (setDetailedItem etc., below) since they're the same
  // underlying equipment, just read two different ways. Only the movement
  // calculation differs - Basic+ stays armour-driven and ignores weight -
  // which is why setDetailedItem only recomputes weight-based movement
  // when Detailed itself is the active mode.
  const detailedTotal = coinWeight + (["equipment", "weaponsArmour", "magicItems", "treasure"] as const)
    .reduce((sum, k) => sum + c.detailedInventory[k].reduce((s, item) => s + (item.weight || 0), 0), 0);
  const detailedSpeed = detailedSpeedForWeight(detailedTotal);

  const setDetailedItem = (category: keyof DetailedInventory, i: number, patch: Partial<WeightedItem>) => {
    const items = c.detailedInventory[category].map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    const detailedInventory = { ...c.detailedInventory, [category]: items };
    if (c.inventoryMode === "detailed") {
      const newTotal = coinWeight + (["equipment", "weaponsArmour", "magicItems", "treasure"] as const)
        .reduce((sum, k) => sum + detailedInventory[k].reduce((s, it) => s + (it.weight || 0), 0), 0);
      applyMovement(detailedSpeedForWeight(newTotal), { detailedInventory });
    } else {
      onChange({ ...c, detailedInventory });
    }
  };
  const reorderDetailedRow = (category: keyof DetailedInventory, from: number, to: number) => {
    onChange({ ...c, detailedInventory: { ...c.detailedInventory, [category]: reorder(c.detailedInventory[category], from, to) } });
  };
  const addDetailedRow = (category: keyof DetailedInventory) => {
    onChange({ ...c, detailedInventory: { ...c.detailedInventory, [category]: [...c.detailedInventory[category], { name: "", weight: 0 }] } });
  };
  const removeDetailedRow = (category: keyof DetailedInventory, i: number) => {
    const items = c.detailedInventory[category].filter((_, idx) => idx !== i);
    const detailedInventory = { ...c.detailedInventory, [category]: items };
    if (c.inventoryMode === "detailed") {
      const newTotal = coinWeight + (["equipment", "weaponsArmour", "magicItems", "treasure"] as const)
        .reduce((sum, k) => sum + detailedInventory[k].reduce((s, it) => s + (it.weight || 0), 0), 0);
      applyMovement(detailedSpeedForWeight(newTotal), { detailedInventory });
    } else {
      onChange({ ...c, detailedInventory });
    }
  };

  const setUnenc = (v: string) => onChange({ ...c, itemBasedInventory: { ...c.itemBasedInventory, unencumbering: v } });
  const setEquipped = (i: number, v: string) => {
    const arr = [...c.itemBasedInventory.equipped]; arr[i] = v;
    const itemBasedInventory = { ...c.itemBasedInventory, equipped: arr };
    applyMovement(itemBasedSpeed(arr, c.itemBasedInventory.packed), { itemBasedInventory });
  };
  const setPacked = (i: number, v: string) => {
    const arr = [...c.itemBasedInventory.packed]; arr[i] = v;
    const itemBasedInventory = { ...c.itemBasedInventory, packed: arr };
    applyMovement(itemBasedSpeed(c.itemBasedInventory.equipped, arr), { itemBasedInventory });
  };

  const detailedBoxes: { key: keyof DetailedInventory; title: string; placeholder: string }[] = [
    { key: "equipment", title: "Equipment", placeholder: "Adventuring Gear" },
    { key: "weaponsArmour", title: "Weapons & Armour", placeholder: "Weapon" },
    { key: "magicItems", title: "Magic Items", placeholder: "Magic Item" },
    { key: "treasure", title: "Treasure", placeholder: "Gem, Jewelry, Potion..." },
  ];

  return (
    <div className="inventory-wrap">
      <div className="inventory-header">
        <h3>Inventory</h3>
        <div className="inv-toggle">
          <button className={`inv-tab ${c.inventoryMode === "basic" ? "active" : ""}`} disabled={!canEdit}
            onClick={() => onChange({ ...c, inventoryMode: "basic" })}>Basic</button>
          <button className={`inv-tab ${c.inventoryMode === "basic-plus" ? "active" : ""}`} disabled={!canEdit}
            onClick={() => onChange({ ...c, inventoryMode: "basic-plus" })}>Basic+</button>
          <button className={`inv-tab ${c.inventoryMode === "detailed" ? "active" : ""}`} disabled={!canEdit}
            onClick={() => onChange({ ...c, inventoryMode: "detailed" })}>Detailed</button>
          <button className={`inv-tab ${c.inventoryMode === "item" ? "active" : ""}`} disabled={!canEdit}
            onClick={() => onChange({ ...c, inventoryMode: "item" })}>Item-Based</button>
        </div>
      </div>

      {c.inventoryMode === "basic" && (
        <div className="inventory-status-row">
          <div className="armour-toggle">
            {(["unarmoured", "light", "heavy"] as const).map((a) => (
              <button key={a} className={`armour-btn ${c.basicInventory.armourType === a ? "active" : ""}`}
                disabled={!canEdit} onClick={() => setBasic("armourType", a)}>
                {a.charAt(0).toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
          <label className="treasure-check">
            <input type="checkbox" checked={c.basicInventory.carryingTreasure} disabled={!canEdit}
              onChange={(e) => setBasic("carryingTreasure", e.target.checked)} />
            With Treasure
          </label>
          <div className="weight-total">
            <span className="weight-total-speed">
              &#8594; {BASIC_MOVEMENT[c.basicInventory.armourType][c.basicInventory.carryingTreasure ? "with" : "without"]}'
              ({Math.round(BASIC_MOVEMENT[c.basicInventory.armourType][c.basicInventory.carryingTreasure ? "with" : "without"] / 3)}')
            </span>
          </div>
          <div className="weight-total">
            <span className="weight-total-num">Total Coins: {coinWeight}</span>
          </div>
        </div>
      )}
      {c.inventoryMode === "basic-plus" && (
        <div className="inventory-status-row">
          <div className="armour-toggle">
            {(["unarmoured", "light", "heavy"] as const).map((a) => (
              <button key={a} className={`armour-btn ${c.basicInventory.armourType === a ? "active" : ""}`}
                disabled={!canEdit} onClick={() => setBasic("armourType", a)}>
                {a.charAt(0).toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
          <label className="treasure-check">
            <input type="checkbox" checked={c.basicInventory.carryingTreasure} disabled={!canEdit}
              onChange={(e) => setBasic("carryingTreasure", e.target.checked)} />
            With Treasure
          </label>
          <div className="weight-total">
            <span className="weight-total-speed">
              &#8594; {BASIC_MOVEMENT[c.basicInventory.armourType][c.basicInventory.carryingTreasure ? "with" : "without"]}'
              ({Math.round(BASIC_MOVEMENT[c.basicInventory.armourType][c.basicInventory.carryingTreasure ? "with" : "without"] / 3)}')
            </span>
          </div>
          <div className="weight-total">
            <span className="weight-total-num">Total Coins: {detailedTotal}</span>
          </div>
        </div>
      )}
      {c.inventoryMode === "detailed" && (
        <div className="inventory-status-row">
          <div className={`weight-total ${detailedTotal > 1600 ? "overloaded" : ""}`}>
            <span className="weight-total-num">Total Weight: {detailedTotal} coins</span>
            <span className="weight-total-speed">{detailedTotal > 1600 ? "Can't move" : `\u2192 ${detailedSpeed}' (${Math.round(detailedSpeed / 3)}')`}</span>
          </div>
          <div className="coin-ref-row">
            <span className="coin-ref-label">Up to</span>
            {[
              { max: 400, rate: "120' (40')" },
              { max: 600, rate: "90' (30')" },
              { max: 800, rate: "60' (20')" },
              { max: 1600, rate: "30' (10')" },
            ].map(({ max, rate }, i, arr) => {
              const min = i === 0 ? 0 : arr[i - 1].max;
              const isCurrent = detailedTotal > min && detailedTotal <= max;
              return (
                <span key={max} className={`coin-ref-cell ${isCurrent ? "current" : ""}`}>{max} / {rate}</span>
              );
            })}
          </div>
        </div>
      )}
      {c.inventoryMode === "item" && (
        <div className="inventory-status-row">
          <div className="weight-total">
            <span className="weight-total-num">Total Coins: {coinWeight}</span>
            <span className="weight-total-speed">&#8594; ~{Math.ceil(coinWeight / 100) || 0} packed slot{Math.ceil(coinWeight / 100) === 1 ? "" : "s"}</span>
          </div>
        </div>
      )}

      {c.inventoryMode === "basic" && (
        <>
          <Caption>Movement is set by armour worn, and whether the referee judges you're carrying a significant amount of treasure - not by what's actually in these boxes.</Caption>
          <div className="inv-grid">
            <div className="inv-box">
              <h4>Equipment</h4>
              <textarea rows={7} value={c.basicInventory.equipment} disabled={!canEdit} onChange={(e) => setBasic("equipment", e.target.value)} />
            </div>
            <div className="inv-box">
              <h4>Weapons &amp; Armour</h4>
              <textarea rows={7} value={c.basicInventory.weaponsArmour} disabled={!canEdit} onChange={(e) => setBasic("weaponsArmour", e.target.value)} />
            </div>
            <div className="inv-box">
              <h4>Magic Items</h4>
              <textarea rows={7} value={c.basicInventory.magicItems} disabled={!canEdit} onChange={(e) => setBasic("magicItems", e.target.value)} />
            </div>
            <div className="inv-box">
              <h4>Treasure</h4>
              <textarea rows={7} value={c.basicInventory.treasure} disabled={!canEdit} onChange={(e) => setBasic("treasure", e.target.value)} />
            </div>
          </div>
        </>
      )}

      {(c.inventoryMode === "basic-plus" || c.inventoryMode === "detailed") && (
        <>
          {c.inventoryMode === "basic-plus" && (
            <Caption>Movement is still set by armour worn and whether you're carrying treasure, same as Basic - these lists (and their weights) are shared with Detailed and are for reference here; they don't change your speed. Weight is optional; leave it at 0 if you don't want to bother with it.</Caption>
          )}
          <div className="inv-grid">
            {detailedBoxes.map(({ key, title, placeholder }) => (
              <WeightedBox key={key} category={key} title={title} placeholder={placeholder}
                items={c.detailedInventory[key]} canEdit={canEdit}
                onSet={setDetailedItem} onAdd={addDetailedRow} onRemove={removeDetailedRow} onReorder={reorderDetailedRow} />
            ))}
          </div>
        </>
      )}

      {c.inventoryMode === "item" && (
        <div className="encumbrance-grid">
          {/*
            One shared 19-row table, one shared spine - this works because
            Packed's breakpoints are always exactly Equipped's + 10 (3/13,
            5/15, 7/17, 9/19), so offsetting Equipped to start at row 11
            makes every one of its own breakpoints land on the exact same
            row as Packed's. Rows 1-10 on the left are one merged cell
            (Unencumbering box + both header/captions); Equipped's 9 real
            input rows run from row 11 to row 19, ending exactly where
            Packed's 19 rows end too.
          */}
          <table className="encumbrance-table">
            <colgroup><col style={{ width: "38%" }} /><col style={{ width: 74 }} /><col /></colgroup>
            <tbody>
              <tr className="header-row">
                <td><h4>Unencumbering Items</h4></td>
                <td className="mv-header">Base<br />Mv. Rate</td>
                <td><h4>Packed Items</h4></td>
              </tr>
              {Array.from({ length: 19 }).map((_, row) => {
                const isEquippedRow = row >= 10; // rows 11-19 (0-indexed 10-18)
                const equippedIdx = row - 10;

                let ladderCell: ReactNode = null;
                if (row === 0) ladderCell = <td rowSpan={13} className="ladder-cell first-zone">120' (40')</td>;
                else if (row === 13) ladderCell = <td rowSpan={2} className="ladder-cell">90' (30')</td>;
                else if (row === 15) ladderCell = <td rowSpan={2} className="ladder-cell">60' (20')</td>;
                else if (row === 17) ladderCell = <td rowSpan={2} className="ladder-cell">30' (10')</td>;

                return (
                  <tr key={row}>
                    {row === 0 && (
                      <UnencumberingCell value={c.itemBasedInventory.unencumbering} canEdit={canEdit} onChange={setUnenc} />
                    )}
                    {isEquippedRow && (
                      <td className="ib-input-cell">
                        <input value={c.itemBasedInventory.equipped[equippedIdx]} disabled={!canEdit}
                          onChange={(e) => setEquipped(equippedIdx, e.target.value)} />
                      </td>
                    )}
                    {ladderCell}
                    <td className="ib-input-cell packed">
                      <input value={c.itemBasedInventory.packed[row]} disabled={!canEdit} onChange={(e) => setPacked(row, e.target.value)} />
                      {row < 6 && <span className="str-tag">{strTags[row]}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Caption>All other equipment, packed into sacks and backpacks. Retrieving a packed item in combat optionally takes one round.</Caption>
          <Caption>STR modifier (optional, honor system - not enforced here): a STR-tagged row can only be used if your STR meets that threshold.</Caption>
        </div>
      )}
    </div>
  );
}

function ClassFeaturesSection({ character: c, canEdit, onChange, onRollThiefSkill, onRollTurnUndead }: {
  character: Character; canEdit: boolean; onChange: (c: Character) => void;
  onRollThiefSkill: (key: string, displayValue: string) => void;
  onRollTurnUndead: (col: string, value: string | number) => void;
}) {
  const [showThiefTable, setShowThiefTable] = useState(false);
  const [showTurnTable, setShowTurnTable] = useState(false);

  const setFeature = (k: keyof Character["classFeatures"], v: boolean) =>
    onChange({ ...c, classFeatures: { ...c.classFeatures, [k]: v } });

  const thiefValues = thiefSkillsForLevel(c.level);
  const turnValues = turnUndeadForLevel(c.level);

  const showThief = c.classFeatures.thief;
  const showTurnUndead = c.classFeatures.cleric;
  const showSpells = c.classFeatures.cleric || c.classFeatures.magicUser;

  return (
    <div className="class-features-wrap">
      <h3>Class Features</h3>
      <div className="class-features">
        <label className="feature-check">
          <input type="checkbox" checked={c.classFeatures.cleric} disabled={!canEdit} onChange={(e) => setFeature("cleric", e.target.checked)} /> Cleric
        </label>
        <label className="feature-check">
          <input type="checkbox" checked={c.classFeatures.magicUser} disabled={!canEdit} onChange={(e) => setFeature("magicUser", e.target.checked)} /> Magic-User
        </label>
        <label className="feature-check">
          <input type="checkbox" checked={c.classFeatures.thief} disabled={!canEdit} onChange={(e) => setFeature("thief", e.target.checked)} /> Thief
        </label>
      </div>

      {showThief && (
        <div className="feature-block show">
          <h4>Thief Skills &mdash; Level {c.level}</h4>
          <div className="compact-row">
            {THIEF_SKILL_KEYS.map((k) => (
              <div className="compact-cell" key={k}>
                <button className="compact-chip rollable" onClick={() => onRollThiefSkill(k, thiefValues[k])} data-tip="Click to roll">{THIEF_SKILL_NAMES[k]}</button>
                <div className="compact-val">{thiefValues[k]}</div>
              </div>
            ))}
          </div>
          <button className="table-toggle" onClick={() => setShowThiefTable((s) => !s)}>
            {showThiefTable ? "\u25be Hide" : "\u25b8 Show"} full Thief Skills table
          </button>
          {showThiefTable && (
            <>
              <Caption>CS Climb Sheer Surfaces &middot; TR Find/Remove Traps &middot; HN Hear Noise &middot; HS Hide in Shadows &middot; MS Move Silently &middot; OL Open Locks &middot; PP Pick Pockets</Caption>
              <ThiefTable currentLevel={c.level} />
            </>
          )}
        </div>
      )}

      {showSpells && <SpellsSection character={c} canEdit={canEdit} onChange={onChange} />}

      {showTurnUndead && (
        <div className="feature-block show">
          <h4>Turn Undead &mdash; Level {c.level}</h4>
          <Caption>Click the HD of the undead you're facing. T = auto-turn, D = auto-destroy, &mdash; = cannot be turned.</Caption>
          <div className="compact-row">
            {TURN_UNDEAD_COLUMNS.map((col, i) => (
              <div className="compact-cell" key={col}>
                <button className="compact-chip rollable" onClick={() => onRollTurnUndead(col, turnValues[i])} data-tip={`Roll vs HD ${col}`}>{col}</button>
                <div className="compact-val">{turnValues[i]}</div>
              </div>
            ))}
          </div>
          <button className="table-toggle" onClick={() => setShowTurnTable((s) => !s)}>
            {showTurnTable ? "\u25be Hide" : "\u25b8 Show"} full Turn Undead table
          </button>
          {showTurnTable && <TurnUndeadTable currentLevel={c.level} />}
        </div>
      )}
    </div>
  );
}

function reorder<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

function DragHandle() {
  return (
    <span className="drag-handle" data-tip="Drag to reorder">
      <svg viewBox="0 0 10 16" width="10" height="16"><circle cx="2.5" cy="2.5" r="1.4" /><circle cx="7.5" cy="2.5" r="1.4" /><circle cx="2.5" cy="8" r="1.4" /><circle cx="7.5" cy="8" r="1.4" /><circle cx="2.5" cy="13.5" r="1.4" /><circle cx="7.5" cy="13.5" r="1.4" /></svg>
    </span>
  );
}

function WeightedBox({ category, title, placeholder, items, canEdit, onSet, onAdd, onRemove, onReorder }: {
  category: keyof DetailedInventory; title: string; placeholder: string; items: WeightedItem[]; canEdit: boolean;
  onSet: (category: keyof DetailedInventory, i: number, patch: Partial<WeightedItem>) => void;
  onAdd: (category: keyof DetailedInventory) => void;
  onRemove: (category: keyof DetailedInventory, i: number) => void;
  onReorder: (category: keyof DetailedInventory, from: number, to: number) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dropItem = (i: number) => {
    if (dragIndex === null || dragIndex === i) { setOverIndex(null); return; }
    onReorder(category, dragIndex, i);
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="inv-box">
      <h4>{title}</h4>
      <div className="weighted-list">
        <div className="weighted-row weighted-head">
          <span className="mem-head-spacer" />
          <span className="caption" style={{ margin: 0, flex: 1 }}>Item</span>
          <span className="caption" style={{ margin: 0, width: 60 }}>Wt (cn)</span>
        </div>
        {items.map((item, i) => (
          <div className={`weighted-row ${dragIndex === i ? "dragging" : ""} ${overIndex === i && dragIndex !== i ? "drag-over" : ""}`} key={i}
            onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); setOverIndex(i); }}
            onDragLeave={() => setOverIndex((cur) => (cur === i ? null : cur))}
            onDrop={() => canEdit && dropItem(i)}>
            {canEdit ? (
              <span draggable onDragStart={() => setDragIndex(i)} onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}>
                <DragHandle />
              </span>
            ) : <span className="mem-head-spacer" />}
            <input className="weighted-name" value={item.name} placeholder={placeholder} disabled={!canEdit}
              onChange={(e) => onSet(category, i, { name: e.target.value })} />
            <input className="weighted-weight" type="number" value={item.weight} disabled={!canEdit}
              onChange={(e) => onSet(category, i, { weight: Number(e.target.value) || 0 })} />
            {canEdit && <button className="weighted-remove" onClick={() => onRemove(category, i)}>&times;</button>}
          </div>
        ))}
        {canEdit && <button className="btn text btn-add" onClick={() => onAdd(category)}>+ Item</button>}
      </div>
    </div>
  );
}

function SpellsSection({ character: c, canEdit, onChange }: {
  character: Character; canEdit: boolean; onChange: (c: Character) => void;
}) {
  const [showReference, setShowReference] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const isMU = c.classFeatures.magicUser;
  const className = isMU ? "Magic-User" : "Cleric";
  const referenceList = isMU ? MAGIC_USER_SPELLS : CLERIC_SPELLS;

  const addMemorized = () => onChange({ ...c, memorizedSpells: [...c.memorizedSpells, { name: "", level: 1, used: false }] });
  const updateMemorized = (i: number, patch: Partial<MemorizedSpell>) =>
    onChange({ ...c, memorizedSpells: c.memorizedSpells.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const removeMemorized = (i: number) =>
    onChange({ ...c, memorizedSpells: c.memorizedSpells.filter((_, idx) => idx !== i) });
  const dropMemorized = (i: number) => {
    if (dragIndex === null || dragIndex === i) { setOverIndex(null); return; }
    onChange({ ...c, memorizedSpells: reorder(c.memorizedSpells, dragIndex, i) });
    setDragIndex(null);
    setOverIndex(null);
  };

  const unlockNextLevel = () => onChange({ ...c, spellbookUnlockedLevels: Math.min(6, c.spellbookUnlockedLevels + 1) });
  const updateChapter = (levelIdx: number, spells: string[]) =>
    onChange({ ...c, spellbook: c.spellbook.map((lvl, idx) => (idx === levelIdx ? spells : lvl)) });

  return (
    <div className="feature-block show">
      <h4>Memorized Spells</h4>
      <Caption>Add each spell you have memorized right now &mdash; memorize the same spell twice to cast it twice. Check it off once it's cast. Drag the handle to reorder.</Caption>
      {c.memorizedSpells.length > 0 && (
        <div className="memorized-row memorized-head">
          <span className="mem-head-spacer" />
          <span className="caption" style={{ margin: 0 }}>Cast</span>
          <span className="caption" style={{ margin: 0, flex: 1 }}>Spell</span>
          <span className="caption" style={{ margin: 0, width: 56, textAlign: "center" }}>Level</span>
          <span className="mem-head-spacer" />
        </div>
      )}
      <div className="memorized-list">
        {c.memorizedSpells.map((sp, i) => (
          <div className={`memorized-row ${dragIndex === i ? "dragging" : ""} ${overIndex === i && dragIndex !== i ? "drag-over" : ""}`} key={i}
            onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); setOverIndex(i); }}
            onDragLeave={() => setOverIndex((cur) => (cur === i ? null : cur))}
            onDrop={() => canEdit && dropMemorized(i)}>
            {canEdit ? (
              <span draggable onDragStart={() => setDragIndex(i)} onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}>
                <DragHandle />
              </span>
            ) : <span className="mem-head-spacer" />}
            <input type="checkbox" checked={sp.used} disabled={!canEdit} data-tip="Cast today"
              onChange={(e) => updateMemorized(i, { used: e.target.checked })} />
            <input className="mem-name" placeholder="Spell name" value={sp.name} disabled={!canEdit}
              onChange={(e) => updateMemorized(i, { name: e.target.value })} />
            <select className="mem-level" value={sp.level} disabled={!canEdit}
              onChange={(e) => updateMemorized(i, { level: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6].map((l) => <option key={l} value={l}>Lv{l}</option>)}
            </select>
            {canEdit && <button className="row-remove" data-tip="Remove" onClick={() => removeMemorized(i)}>&times;</button>}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="add-spell-row">
          <button className="btn text btn-add" onClick={addMemorized}>+ Spell</button>
        </div>
      )}

      {isMU && (
        <div className="spellbook-wrap">
          <h4>Spellbook</h4>
          <Caption>Spells you've learned, chaptered by level. Unlock the next chapter as you gain access to higher-level spells. Drag to reorder within a level.</Caption>
          {Array.from({ length: c.spellbookUnlockedLevels }).map((_, li) => (
            <SpellbookChapter key={li} level={li + 1} spells={c.spellbook[li] ?? []} canEdit={canEdit}
              onChange={(spells) => updateChapter(li, spells)} />
          ))}
          {canEdit && c.spellbookUnlockedLevels < 6 && (
            <button className="table-toggle" onClick={unlockNextLevel}>+ Level {c.spellbookUnlockedLevels + 1}</button>
          )}
        </div>
      )}

      <div className="spell-reference-toggle-row">
        <button className="table-toggle" onClick={() => setShowReference((s) => !s)}>
          {showReference ? "\u25be Hide" : "\u25b8 Show"} full {className} Spell List
        </button>
      </div>
      {showReference && <SpellReferenceList list={referenceList} />}
    </div>
  );
}

function SpellbookChapter({ level, spells, canEdit, onChange }: {
  level: number; spells: string[]; canEdit: boolean; onChange: (spells: string[]) => void;
}) {
  const [open, setOpen] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const addSpell = () => onChange([...spells, ""]);
  const updateSpell = (i: number, name: string) => onChange(spells.map((s, idx) => (idx === i ? name : s)));
  const removeSpell = (i: number) => onChange(spells.filter((_, idx) => idx !== i));
  const dropSpell = (i: number) => {
    if (dragIndex === null || dragIndex === i) { setOverIndex(null); return; }
    onChange(reorder(spells, dragIndex, i));
    setDragIndex(null);
    setOverIndex(null);
  };
  const filledCount = spells.filter((s) => s.trim()).length;

  return (
    <div className="spellbook-chapter">
      <button className="chapter-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "\u25be" : "\u25b8"} Level {level} <span className="chapter-count">({filledCount})</span>
      </button>
      {open && (
        <div className="chapter-body">
          {spells.map((name, i) => (
            <div className={`chapter-row ${dragIndex === i ? "dragging" : ""} ${overIndex === i && dragIndex !== i ? "drag-over" : ""}`} key={i}
              onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); setOverIndex(i); }}
              onDragLeave={() => setOverIndex((cur) => (cur === i ? null : cur))}
              onDrop={() => canEdit && dropSpell(i)}>
              {canEdit ? (
                <span draggable onDragStart={() => setDragIndex(i)} onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}>
                  <DragHandle />
                </span>
              ) : <span className="mem-head-spacer" />}
              <input value={name} placeholder="Spell name" disabled={!canEdit} onChange={(e) => updateSpell(i, e.target.value)} />
              {canEdit && <button className="row-remove" data-tip="Remove" onClick={() => removeSpell(i)}>&times;</button>}
            </div>
          ))}
          {canEdit && <button className="btn text btn-add" onClick={addSpell}>+ Spell</button>}
        </div>
      )}
    </div>
  );
}

function SpellReferenceList({ list }: { list: string[][] }) {
  return (
    <div className="spell-reference">
      {list.map((spells, i) => i > 0 && spells.length > 0 && (
        <div key={i} className="spell-reference-level">
          <div className="spell-reference-level-label">Level {i}</div>
          <ul>
            {[...spells].sort((a, b) => a.localeCompare(b)).map((name) => <li key={name}>{name}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}


function ThiefTable({ currentLevel }: { currentLevel?: number }) {
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
        {rows.map((r) => <tr key={r[0]} className={r[0] === currentLevel ? "current-row" : ""}>{r.map((v, i) => <td key={i}>{v}</td>)}</tr>)}
      </tbody>
    </table>
  );
}

function TurnUndeadTable({ currentLevel }: { currentLevel?: number }) {
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
        {rows.map((r, i) => {
          const rowLevel = i + 1 >= 11 ? 11 : i + 1;
          const isCurrent = currentLevel !== undefined && (currentLevel >= 11 ? rowLevel === 11 : rowLevel === currentLevel);
          return <tr key={i} className={isCurrent ? "current-row" : ""}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>;
        })}
      </tbody>
    </table>
  );
}
