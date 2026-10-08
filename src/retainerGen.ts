import { NAME_LISTS } from "./retainerNames";
import { abilityMod } from "./abilities";
import { CLERIC_SPELLS, MAGIC_USER_SPELLS } from "./spells";
import { classStats, NORMAL_HUMAN_SAVES, type ClassKey } from "./classData";
import { YELLOW, type Retainer } from "./retainerTypes";
import type { Abilities, MemorizedSpell, Weapon } from "./types";

// Retainer generator. Order: ability scores (3d6 in order) -> class (d20,
// Normal Human if the scores rule the class out) -> level -> hit points,
// saves, attack, spells -> alignment -> equipment -> magic item checks.
// Tables: Carcass Crawler 2 "Hiring Retainers" + "Quick Equipment",
// OSE Classic Characters level tables, Classic Rules Tome "Adventuring
// Parties" (alignment, magic items).

const rnd = (n: number) => Math.floor(Math.random() * n) + 1;
const roll = (count: number, sides: number) => {
  let t = 0;
  for (let i = 0; i < count; i++) t += rnd(sides);
  return t;
};
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];


/** 2-in-6 female. Thief uses Fighter names; Normal Human picks Cleric, Fighter or Magic-User names. */
function randomName(cls: string): string {
  const key = cls === "Normal Human" ? pick(["Cleric", "Fighter", "Magic-User"]) : cls === "Thief" ? "Fighter" : cls;
  const lists = NAME_LISTS[key];
  return pick(rnd(6) <= 2 ? lists.f : lists.m);
}

function rollClass(a: Abilities): ClassKey | "Normal Human" {
  const r = rnd(20);
  const cls: ClassKey | "Normal Human" =
    r <= 3 ? "Cleric" : r <= 8 ? "Fighter" : r === 9 ? "Magic-User" : r <= 13 ? "Thief" :
    r === 14 ? "Halfling" : r === 15 ? "Dwarf" : r === 16 ? "Elf" : "Normal Human";
  // Class minimums: a score that rules the class out leaves a Normal Human.
  if (cls === "Dwarf" && a.con < 9) return "Normal Human";
  if (cls === "Elf" && a.int < 9) return "Normal Human";
  if (cls === "Halfling" && (a.con < 9 || a.dex < 9)) return "Normal Human";
  return cls;
}

const rollLevel = () => (rnd(6) === 1 ? rnd(3) + 1 : 1);

// Spell slots by level (levels 1-4 only - all an applicant can be).
const SLOTS: Partial<Record<ClassKey, number[][]>> = {
  Cleric: [[], [1], [2], [2, 1]],
  Elf: [[1], [2], [2, 1], [2, 2]],
  "Magic-User": [[1], [2], [2, 1], [2, 2]],
};

function rollSpells(cls: ClassKey, level: number): MemorizedSpell[] {
  const slots = SLOTS[cls]?.[level - 1] ?? [];
  const list = cls === "Cleric" ? CLERIC_SPELLS : MAGIC_USER_SPELLS;
  const out: MemorizedSpell[] = [];
  slots.forEach((n, i) => {
    const pool = [...list[i + 1]];
    for (let k = 0; k < n && pool.length; k++) {
      const [name] = pool.splice(rnd(pool.length) - 1, 1);
      out.push({ name, level: i + 1, used: false });
    }
  });
  return out;
}

const ARMOUR_D6: { name: string; ac: number; shield: boolean; move: number }[] = [
  { name: "Leather armour", ac: 12, shield: false, move: 90 },
  { name: "Leather armour + shield", ac: 12, shield: true, move: 90 },
  { name: "Chainmail", ac: 14, shield: false, move: 60 },
  { name: "Chainmail + shield", ac: 14, shield: true, move: 60 },
  { name: "Plate mail", ac: 16, shield: false, move: 60 },
  { name: "Plate mail + shield", ac: 16, shield: true, move: 60 },
];

const W = (name: string, damage: string, ranged = false): Weapon => ({ name, damage, bonus: "", ranged });
const WEAPON_D12: Weapon[] = [
  W("Battle axe", "1d8"), W("Crossbow + 20 bolts", "1d6", true), W("Hand axe", "1d6"), W("Mace", "1d6"),
  W("Polearm", "1d10"), W("Short bow + 20 arrows", "1d6", true), W("Short sword", "1d6"), W("Silver dagger", "1d4"),
  W("Sling + 20 stones", "1d4", true), W("Spear", "1d6"), W("Sword", "1d8"), W("War hammer", "1d6"),
];
const CLERIC_WEAPONS_D4: Weapon[] = [W("Mace", "1d6"), W("Sling + 20 stones", "1d4", true), W("Staff", "1d4"), W("War hammer", "1d6")];
const GEAR_D12 = [
  "Crowbar", "Hammer (small) + 12 iron spikes", "Holy water", "Lantern + 3 flasks of oil", "Mirror (hand-sized, steel)",
  "Pole (10' long, wooden)", "Rope (50')", "Rope (50') + grappling hook", "Sack (large)", "Sack (small)",
  "Stakes (3) + mallet", "Wolfsbane (1 bunch)",
];

// Magic item sub-tables a class could use. 5% per level of the NPC per
// sub-table (Rules Tome, Adventuring Parties); items the NPC can't use are
// ignored, so only sub-tables the class can use are rolled.
const ALL_SUBTABLES = ["Potion", "Scroll", "Ring", "Wand/Staff/Rod", "Misc. Item", "Armour/Shield", "Sword", "Misc. Weapon"];
const SUBTABLES: Record<ClassKey, string[]> = {
  Cleric: ["Potion", "Scroll", "Ring", "Wand/Staff/Rod", "Misc. Item", "Armour/Shield", "Misc. Weapon"],
  Dwarf: ["Potion", "Ring", "Misc. Item", "Armour/Shield", "Sword", "Misc. Weapon"],
  Elf: ALL_SUBTABLES,
  Fighter: ["Potion", "Ring", "Misc. Item", "Armour/Shield", "Sword", "Misc. Weapon"],
  Halfling: ["Potion", "Ring", "Misc. Item", "Armour/Shield", "Sword", "Misc. Weapon"],
  "Magic-User": ["Potion", "Scroll", "Ring", "Wand/Staff/Rod", "Misc. Item", "Misc. Weapon"],
  Thief: ["Potion", "Ring", "Misc. Item", "Armour/Shield", "Sword", "Misc. Weapon"],
};

export function generateRetainer(order: number): Retainer {
  // 1. Abilities, 3d6 in order.
  const a: Abilities = { str: roll(3, 6), int: roll(3, 6), wis: roll(3, 6), dex: roll(3, 6), con: roll(3, 6), cha: roll(3, 6) };
  // 2-3. Class, then level.
  const cls = rollClass(a);
  const normal = cls === "Normal Human";
  const level = normal ? 0 : rollLevel();
  const conMod = abilityMod(a.con);
  const dexMod = abilityMod(a.dex);

  // 4. Hit points, saves, attack bonus, spells.
  let hp = 0;
  let saves = NORMAL_HUMAN_SAVES;
  let attackBonus = -1;
  let spells: MemorizedSpell[] = [];
  if (normal) {
    hp = Math.max(1, rnd(4) + conMod);
  } else {
    const info = classStats(cls, level, a, "1-2");
    for (let i = 0; i < level; i++) hp += Math.max(1, rnd(info.hitDie) + conMod);
    saves = info.saves;
    attackBonus = info.attackBonus;
    spells = rollSpells(cls, level);
  }

  // 5. Alignment (d6).
  const al = rnd(6);
  const alignment = al <= 2 ? "Lawful" : al <= 4 ? "Neutral" : "Chaotic";

  // 6. Equipment (Quick Equipment). Normal Humans have none.
  let ac = 10 + dexMod;
  let move = 120;
  const items: string[] = [];
  const weapons: Weapon[] = [];
  if (normal) {
    weapons.push(W("Improvised weapon", "1d6"));
  } else {
    let armour = null as (typeof ARMOUR_D6)[number] | null;
    if (cls === "Thief") armour = ARMOUR_D6[0];
    else if (cls !== "Magic-User") armour = ARMOUR_D6[rnd(6) - 1];
    if (armour) {
      ac = armour.ac + (armour.shield ? 1 : 0) + dexMod;
      move = armour.move;
      items.push(armour.name);
    }
    const picks = cls === "Magic-User" ? [W("Dagger", "1d4")]
      : cls === "Cleric" ? [pick(CLERIC_WEAPONS_D4), pick(CLERIC_WEAPONS_D4)]
      : [pick(WEAPON_D12), pick(WEAPON_D12)];
    for (const w of picks) if (!weapons.some((x) => x.name === w.name)) weapons.push({ ...w });
    items.push("Backpack", "Tinder box", "Waterskin", `Torches (${roll(1, 6)})`, `Iron rations (${roll(1, 6)})`, `${roll(3, 6)} gp`);
    if (cls === "Cleric") items.push("Holy symbol");
    if (cls === "Thief") items.push("Thieves' tools");
    items.push(pick(GEAR_D12), pick(GEAR_D12));

    // 7. Magic items: 5% per level, once for each suitable sub-table.
    for (const table of SUBTABLES[cls]) if (rnd(100) <= 5 * level) items.push(`Magic item (${table})`);
  }

  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: 0,
    order,
    name: randomName(cls),
    classKey: cls,
    level,
    alignment,
    abilities: a,
    hpCurrent: hp,
    hpMax: hp,
    ac,
    move,
    attackBonus,
    saves,
    weapons,
    items,
    spells,
    ownerCharacterId: "",
    color: YELLOW,
    hidden: false,
    linkedTokenId: null,
  };
}
