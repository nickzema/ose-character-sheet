// Verified against the OSE SRD (Ability Scores) and the AAC character sheet.

function bracket(score: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  if (score <= 3) return 0;
  if (score <= 5) return 1;
  if (score <= 8) return 2;
  if (score <= 12) return 3;
  if (score <= 15) return 4;
  if (score <= 17) return 5;
  return 6; // 18+
}

const STD_MOD = [-3, -2, -1, 0, 1, 2, 3];
const OPEN_DOORS = ["1-in-6", "1-in-6", "1-in-6", "2-in-6", "3-in-6", "4-in-6", "5-in-6"];
const INIT_MOD = [-2, -1, -1, 0, 1, 1, 2];
const CHA_MAX_RETAINERS = [1, 2, 3, 4, 5, 6, 7];
const CHA_LOYALTY = [4, 5, 6, 7, 8, 9, 10];

export const abilityMod = (score: number) => STD_MOD[bracket(score)];
export const strOpenDoors = (score: number) => OPEN_DOORS[bracket(score)];
export const dexInitMod = (score: number) => INIT_MOD[bracket(score)];
export const chaMaxRetainers = (score: number) => CHA_MAX_RETAINERS[bracket(score)];
export const chaLoyalty = (score: number) => CHA_LOYALTY[bracket(score)];

export function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function unarmoredAC(dexScore: number): number {
  return 10 + abilityMod(dexScore);
}

// Thief Skills Chance of Success, by level. Levels beyond the table clamp
// to the nearest printed row (1 or 14).
const THIEF_TABLE: Record<string, number[]> = {
  //     CS  TR  HN     HS  MS  OL  PP     (HN uses a "1-2" style range, handled separately)
  CS: [87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 99],
  TR: [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 95, 97, 99],
  HS: [10, 15, 20, 25, 30, 36, 45, 55, 65, 75, 85, 90, 95, 99],
  MS: [20, 25, 25, 30, 40, 45, 55, 65, 75, 85, 95, 96, 98, 99],
  OL: [15, 20, 30, 30, 35, 45, 55, 65, 75, 85, 95, 96, 97, 99],
  PP: [20, 25, 30, 35, 40, 45, 55, 65, 75, 85, 95, 105, 115, 125],
};
const THIEF_HN: string[] = ["1-2", "1-2", "1-3", "1-3", "1-3", "1-3", "1-4", "1-4", "1-4", "1-4", "1-5", "1-5", "1-5", "1-5"];

export function thiefSkillsForLevel(level: number): Record<string, string> {
  const idx = Math.max(1, Math.min(14, level)) - 1;
  return {
    CS: `${THIEF_TABLE.CS[idx]}%`,
    TR: `${THIEF_TABLE.TR[idx]}%`,
    HN: THIEF_HN[idx],
    HS: `${THIEF_TABLE.HS[idx]}%`,
    MS: `${THIEF_TABLE.MS[idx]}%`,
    OL: `${THIEF_TABLE.OL[idx]}%`,
    PP: `${THIEF_TABLE.PP[idx]}%`,
  };
}

// Turn Undead, by cleric level. Each row is the roll needed against
// undead HD 1,2,2*,3,4,5,6,7-9 - "T" auto-turns, "D" auto-destroys,
// "\u2014" has no effect. Level 11+ all share the same row.
const TURN_TABLE: (string | number)[][] = [
  [7, 9, 11, "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"],
  [7, 9, 11, "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"],
  ["T", 7, 9, 11, "\u2014", "\u2014", "\u2014", "\u2014"],
  ["D", "T", 7, 9, 11, "\u2014", "\u2014", "\u2014"],
  ["D", "D", "T", 7, 9, 11, "\u2014", "\u2014"],
  ["D", "D", "D", "T", 7, 9, 11, "\u2014"],
  ["D", "D", "D", "D", "T", 7, 9, 11],
  ["D", "D", "D", "D", "D", "T", 7, 9],
  ["D", "D", "D", "D", "D", "D", "T", 7],
  ["D", "D", "D", "D", "D", "D", "D", "T"],
  ["D", "D", "D", "D", "D", "D", "D", "D"],
];
export const TURN_UNDEAD_COLUMNS = ["1", "2", "2*", "3", "4", "5", "6", "7-9"];

export function turnUndeadForLevel(level: number): (string | number)[] {
  const idx = Math.max(1, Math.min(11, level)) - 1;
  return TURN_TABLE[idx];
}
