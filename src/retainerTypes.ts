import type { Abilities, MemorizedSpell, Saves, Weapon } from "./types";
import type { ClassKey } from "./classData";

// A retainer card: a lightweight stat block, not a character sheet. Stored in
// room metadata as one small key per card (see useOBR.ts).
export interface Retainer {
  id: string;
  createdAt: number;
  updatedAt: number;
  order: number; // position in the stack (drag to reorder)

  name: string;
  classKey: ClassKey | "Normal Human";
  level: number; // 0 for Normal Humans
  alignment: string;
  abilities: Abilities;

  hpCurrent: number;
  hpMax: number;
  ac: number;
  move: number;
  attackBonus: number;
  saves: Saves;

  weapons: Weapon[];
  items: string[];
  spells: MemorizedSpell[];

  ownerCharacterId: string; // party character this retainer serves; "" = not yet hired
  color: string;
  hidden: boolean; // GM-only: hidden from players
  linkedTokenId: string | null;
}

export const YELLOW = "#FFF69B";

// Post-it note colours (the card's swatch row is Yellow, Pink, Blue, Green,
// White, then the owning character's sheet colour).
export const YELLOW_PI = "#FFF69B";
export const PINK = "#F6C2D9";
export const BLUE = "#A1C8E9";
export const GREEN = "#BCDFC9";
export const WHITE = "#FCFBF8";
export const POSTIT_SWATCHES: [string, string][] = [
  [YELLOW_PI, "Yellow"],
  [PINK, "Pink"],
  [BLUE, "Blue"],
  [GREEN, "Green"],
  [WHITE, "White"],
];

/** Default card colour by class: humans yellow, Halfling pink, Dwarf blue, Elf green, Normal Human white. */
export const colorForClass = (cls: string) =>
  cls === "Halfling" ? PINK : cls === "Dwarf" ? BLUE : cls === "Elf" ? GREEN : cls === "Normal Human" ? WHITE : YELLOW_PI;

export function healRetainer(raw: Partial<Retainer> & { id: string }): Retainer {
  return {
    createdAt: 0,
    updatedAt: 0,
    order: raw.createdAt ?? 0,
    name: "",
    classKey: "Normal Human",
    level: 0,
    alignment: "Neutral",
    hpCurrent: 1,
    hpMax: 1,
    ac: 10,
    move: 120,
    attackBonus: 0,
    saves: { death: 14, wands: 15, paralysis: 16, breath: 17, spells: 18 },
    weapons: [],
    items: [],
    spells: [],
    ownerCharacterId: "",
    color: YELLOW,
    hidden: false,
    linkedTokenId: null,
    ...raw,
    abilities: { str: 10, int: 10, wis: 10, dex: 10, con: 10, cha: 10, ...raw.abilities },
  };
}
