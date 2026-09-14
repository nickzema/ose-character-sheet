// Modifier tables verified against the OSE SRD (Ability Scores).
// https://osesrd.opengamingnetwork.com/player-characters/

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
const CHA_REACTION = [-2, -1, -1, 0, 1, 1, 2];
const CHA_MAX_RETAINERS = [1, 2, 3, 4, 5, 6, 7];
const CHA_LOYALTY = [4, 5, 6, 7, 8, 9, 10];

export function strMelee(score: number) {
  return STD_MOD[bracket(score)];
}
export function strOpenDoors(score: number) {
  return OPEN_DOORS[bracket(score)];
}
export function dexAC(score: number) {
  return STD_MOD[bracket(score)];
}
export function dexMissile(score: number) {
  return STD_MOD[bracket(score)];
}
export function dexInit(score: number) {
  return INIT_MOD[bracket(score)];
}
export function wisMagicSaves(score: number) {
  return STD_MOD[bracket(score)];
}
export function conHP(score: number) {
  return STD_MOD[bracket(score)];
}
export function chaReaction(score: number) {
  return CHA_REACTION[bracket(score)];
}
export function chaMaxRetainers(score: number) {
  return CHA_MAX_RETAINERS[bracket(score)];
}
export function chaLoyalty(score: number) {
  return CHA_LOYALTY[bracket(score)];
}

export function fmtMod(n: number) {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function unarmoredAC(dexScore: number) {
  return 10 + dexAC(dexScore);
}

export function movement(base: number) {
  return {
    overland: Math.round((base / 5) * 10) / 10, // miles/day
    exploration: base, // ft/turn
    encounter: Math.round(base / 3), // ft/round
  };
}
