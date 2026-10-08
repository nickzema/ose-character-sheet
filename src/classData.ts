// Class tables from OSE Classic Fantasy - Characters (level progression tables,
// Level Titles, prime requisites) and the Ability Scores prime-requisite table.

import type { Abilities, Saves } from "./types";

export type ClassKey = "Cleric" | "Dwarf" | "Elf" | "Fighter" | "Halfling" | "Magic-User" | "Thief";
export const CLASS_KEYS: ClassKey[] = ["Cleric", "Dwarf", "Elf", "Fighter", "Halfling", "Magic-User", "Thief"];
export type ClassChoice = "" | ClassKey | "Other";

export const isClassKey = (v: string): v is ClassKey => (CLASS_KEYS as string[]).includes(v);

/** Best-effort match of free-text class names saved by older versions. */
export function classChoiceFromName(name: string): ClassChoice {
  const n = name.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!n) return "";
  if (n === "magic-user" || n === "magicuser" || n === "mu") return "Magic-User";
  const hit = CLASS_KEYS.find((k) => k.toLowerCase() === n);
  return hit ?? "Other";
}

type SaveRow = [number, number, number, number, number];

interface ClassDef {
  hitDie: number;
  maxLevel: number;
  /** HP gained per level beyond 9 (no further Hit Dice, no CON bonus). */
  flatHp: number;
  /** Upper level bound -> saves, in ascending order. */
  saves: [number, SaveRow][];
  /** Upper level bound -> ascending attack bonus (THAC0 19 = +0). */
  attack: [number, number][];
  titles: string[];
  prime: (keyof Abilities)[];
}

const DEFS: Record<ClassKey, ClassDef> = {
  Cleric: {
    hitDie: 6, maxLevel: 14, flatHp: 1,
    saves: [[4, [11, 12, 14, 16, 15]], [8, [9, 10, 12, 14, 12]], [12, [6, 7, 9, 11, 9]], [14, [3, 5, 7, 8, 7]]],
    attack: [[4, 0], [8, 2], [12, 5], [14, 7]],
    titles: ["Acolyte", "Adept", "Priest(ess)", "Vicar", "Curate", "Elder", "Bishop", "Lama", "Matriarch/Patriarch"],
    prime: ["wis"],
  },
  Dwarf: {
    hitDie: 8, maxLevel: 12, flatHp: 3,
    saves: [[3, [8, 9, 10, 13, 12]], [6, [6, 7, 8, 10, 10]], [9, [4, 5, 6, 7, 8]], [12, [2, 3, 4, 4, 6]]],
    attack: [[3, 0], [6, 2], [9, 5], [12, 7]],
    titles: ["Dwarven Veteran", "Dwarven Warrior", "Dwarven Swordmaster", "Dwarven Hero", "Dwarven Swashbuckler", "Dwarven Myrmidon", "Dwarven Champion", "Dwarven Superhero", "Dwarven Lord/Lady"],
    prime: ["str"],
  },
  Elf: {
    hitDie: 6, maxLevel: 10, flatHp: 2,
    saves: [[3, [12, 13, 13, 15, 15]], [6, [10, 11, 11, 13, 12]], [9, [8, 9, 9, 10, 10]], [10, [6, 7, 8, 8, 8]]],
    attack: [[3, 0], [6, 2], [9, 5], [10, 7]],
    titles: ["Medium/Veteran", "Seer/Warrior", "Conjurer/Swordmaster", "Magician/Hero", "Enchanter/Swashbuckler", "Warlock/Myrmidon", "Sorcerer/Champion", "Necromancer/Superhero", "Wizard/Lord"],
    prime: ["int", "str"],
  },
  Fighter: {
    hitDie: 8, maxLevel: 14, flatHp: 2,
    saves: [[3, [12, 13, 14, 15, 16]], [6, [10, 11, 12, 13, 14]], [9, [8, 9, 10, 10, 12]], [12, [6, 7, 8, 8, 10]], [14, [4, 5, 6, 5, 8]]],
    attack: [[3, 0], [6, 2], [9, 5], [12, 7], [14, 9]],
    titles: ["Veteran", "Warrior", "Swordmaster", "Hero", "Swashbuckler", "Myrmidon", "Champion", "Superhero", "Lord/Lady"],
    prime: ["str"],
  },
  Halfling: {
    hitDie: 6, maxLevel: 8, flatHp: 0,
    saves: [[3, [8, 9, 10, 13, 12]], [6, [6, 7, 8, 10, 10]], [8, [4, 5, 6, 7, 8]]],
    attack: [[3, 0], [6, 2], [8, 5]],
    titles: ["Halfling Veteran", "Halfling Warrior", "Halfling Swordmaster", "Halfling Hero", "Halfling Swashbuckler", "Halfling Myrmidon", "Halfling Champion", "Sheriff"],
    prime: ["dex", "str"],
  },
  "Magic-User": {
    hitDie: 4, maxLevel: 14, flatHp: 1,
    saves: [[5, [13, 14, 13, 16, 15]], [10, [11, 12, 11, 14, 12]], [14, [8, 9, 8, 11, 8]]],
    attack: [[5, 0], [10, 2], [14, 5]],
    titles: ["Medium", "Seer", "Conjurer", "Magician", "Enchanter/Enchantress", "Warlock/Witch", "Sorcerer/Sorceress", "Necromancer", "Wizard"],
    prime: ["int"],
  },
  Thief: {
    hitDie: 4, maxLevel: 14, flatHp: 2,
    saves: [[4, [13, 14, 13, 16, 15]], [8, [12, 13, 11, 14, 13]], [12, [10, 11, 9, 12, 10]], [14, [8, 9, 7, 10, 8]]],
    attack: [[4, 0], [8, 2], [12, 5], [14, 7]],
    titles: ["Apprentice", "Footpad", "Robber", "Burglar", "Cutpurse", "Sharper", "Pilferer", "Thief", "Master Thief"],
    prime: ["dex"],
  },
};

function lookup<T>(rows: [number, T][], level: number): T {
  const lv = Math.max(1, level);
  for (const [max, v] of rows) if (lv <= max) return v;
  return rows[rows.length - 1][1];
}

/** XP modifier for a character's prime requisite score(s). */
function xpModifier(cls: ClassKey, a: Abilities): number {
  if (cls === "Elf") {
    if (a.int >= 16 && a.str >= 13) return 10;
    return a.int >= 13 && a.str >= 13 ? 5 : 0;
  }
  if (cls === "Halfling") {
    if (a.dex >= 16 && a.str >= 16) return 10;
    return a.dex >= 13 || a.str >= 13 ? 5 : 0;
  }
  const score = a[DEFS[cls].prime[0]];
  if (score <= 5) return -20;
  if (score <= 8) return -10;
  if (score <= 12) return 0;
  if (score <= 15) return 5;
  return 10;
}

const hearNoiseToXin6 = (hn: string) => {
  const nums = hn.match(/\d+/g);
  return `${nums ? parseInt(nums[nums.length - 1], 10) : 1}-in-6`;
};

export interface ClassStats {
  hitDie: number;
  flatHp: number;
  saves: Saves;
  attackBonus: number;
  title: string;
  xpPercent: string;
  listenDoor: string;
  secretDoor: string;
  findTrap: string;
}

export function classStats(cls: ClassKey, level: number, abilities: Abilities, thiefHearNoise: string): ClassStats {
  const d = DEFS[cls];
  const lv = Math.min(Math.max(1, level), d.maxLevel);
  const [death, wands, paralysis, breath, spells] = lookup(d.saves, lv);
  const mod = xpModifier(cls, abilities);
  return {
    hitDie: d.hitDie,
    flatHp: d.flatHp,
    saves: { death, wands, paralysis, breath, spells },
    attackBonus: lookup(d.attack, lv),
    title: d.titles[Math.min(lv, d.titles.length) - 1],
    xpPercent: mod > 0 ? `+${mod}%` : mod < 0 ? `${mod}%` : "0%",
    listenDoor: cls === "Thief" ? hearNoiseToXin6(thiefHearNoise) : cls === "Dwarf" || cls === "Elf" || cls === "Halfling" ? "2-in-6" : "1-in-6",
    secretDoor: cls === "Elf" ? "2-in-6" : "1-in-6",
    findTrap: cls === "Dwarf" ? "2-in-6" : "1-in-6",
  };
}

/** Class features checkboxes (spells / turn undead / thief skills) implied by a class. */
export function featuresFor(cls: ClassKey) {
  return { cleric: cls === "Cleric", magicUser: cls === "Magic-User" || cls === "Elf", thief: cls === "Thief" };
}

export const hdOf = (cls: ClassKey) => DEFS[cls].hitDie;

// Normal Human (OSE Classic Monsters): level 0, 1/2 HD, THAC0 20 [-1].
export const NORMAL_HUMAN_SAVES: Saves = { death: 14, wands: 15, paralysis: 16, breath: 17, spells: 18 };

export const maxLevelOf = (cls: ClassKey) => DEFS[cls].maxLevel;
