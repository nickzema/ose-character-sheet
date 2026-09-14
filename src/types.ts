export interface Abilities {
  str: number;
  int: number;
  wis: number;
  dex: number;
  con: number;
  cha: number;
}

export interface Saves {
  death: number;
  wands: number;
  paralysis: number;
  breath: number;
  spells: number;
}

export interface Character {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  className: string;
  title: string;
  level: number;
  alignment: string;
  xp: number;
  xpNext: number;

  abilities: Abilities;

  hpCurrent: number;
  hpMax: number;
  ac: number; // ascending AC
  attackBonus: number; // class/level attack bonus (AAC variant)

  saves: Saves;

  baseMove: number; // feet, e.g. 120

  listenDoor: string; // e.g. "1-in-6"
  findSecretDoor: string;
  findTrap: string;

  languages: string;

  equippedItems: string;
  packedItems: string;

  notes: string;
}

export function blankCharacter(ownerId: string, ownerName: string): Character {
  return {
    id: crypto.randomUUID(),
    ownerId,
    ownerName,
    name: "New Character",
    className: "",
    title: "",
    level: 1,
    alignment: "Neutral",
    xp: 0,
    xpNext: 0,
    abilities: { str: 10, int: 10, wis: 10, dex: 10, con: 10, cha: 10 },
    hpCurrent: 1,
    hpMax: 1,
    ac: 10,
    attackBonus: 0,
    saves: { death: 15, wands: 15, paralysis: 15, breath: 15, spells: 15 },
    baseMove: 120,
    listenDoor: "1-in-6",
    findSecretDoor: "1-in-6",
    findTrap: "1-in-6",
    languages: "Common",
    equippedItems: "",
    packedItems: "",
    notes: "",
  };
}
