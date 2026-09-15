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
