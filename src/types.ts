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

export interface Weapon {
  name: string;
  damage: string;
  ranged: boolean; // false = melee (uses STR/Mel), true = missile (uses DEX/Mis)
}

export interface SpellLevel {
  slots: number;
  used: number; // count of slots checked off as spent
  known: string;
}

export type ArmourType = "unarmoured" | "light" | "heavy";

export interface BasicInventory {
  armourType: ArmourType;
  carryingTreasure: boolean;
  equipment: string;
  weaponsArmour: string;
  magicItems: string;
  treasure: string;
}

export interface WeightedItem {
  name: string;
  weight: number; // coin-weight (cn); 10 cn = 1 lb per OSE
}

export interface DetailedInventory {
  equipment: WeightedItem[];
  weaponsArmour: WeightedItem[];
  magicItems: WeightedItem[];
  treasure: WeightedItem[];
}

export interface ItemBasedInventory {
  unencumbering: string;
  equipped: string[]; // fixed-length slot list
  packed: string[]; // fixed-length slot list, STR-tagged rows first
}

export interface Coins {
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}

export type InventoryMode = "basic" | "detailed" | "item";

export interface Character {
  id: string;
  ownerId: string; // OBR player id who created this character
  type: "PC" | "NPC";
  color: string; // sheet paper color, hex
  portrait: string | null; // data URL or token image URL
  linkedTokenId: string | null; // OBR scene item id, if assigned from a token

  name: string;
  player: string; // player's real name (PC) or owning PC's name (NPC)
  className: string;
  title: string;
  level: number;
  alignment: string;

  abilities: Abilities;

  hpCurrent: number;
  hpMax: number;
  ac: number;
  attackBonus: number;

  saves: Saves;

  init: number;
  reaction: number;
  maxRetainers: number;
  retainerLoyalty: number;

  listenDoor: string;
  openDoor: string;
  secretDoor: string;
  findTrap: string;

  baseMove: number;
  overlandMove: number;
  encounterMove: number;

  languages: string;
  literate: boolean;

  weapons: Weapon[];

  inventoryMode: InventoryMode;
  basicInventory: BasicInventory;
  detailedInventory: DetailedInventory;
  itemBasedInventory: ItemBasedInventory;
  coins: Coins;

  classFeatures: {
    cleric: boolean;
    magicUser: boolean;
    thief: boolean;
  };
  spellLevels: SpellLevel[]; // always 6 entries, levels 1-6

  otherNotes: string;

  xp: number;
  xpNext: number;
  xpPercent: string;
}

export function blankCharacter(id: string, ownerId: string): Character {
  return {
    id,
    ownerId,
    type: "PC",
    color: "#FCFBF8",
    portrait: null,
    linkedTokenId: null,

    name: "New Character",
    player: "",
    className: "",
    title: "",
    level: 1,
    alignment: "Neutral",

    abilities: { str: 10, int: 10, wis: 10, dex: 10, con: 10, cha: 10 },

    hpCurrent: 1,
    hpMax: 1,
    ac: 10,
    attackBonus: 0,

    saves: { death: 15, wands: 15, paralysis: 15, breath: 15, spells: 15 },

    init: 0,
    reaction: 0,
    maxRetainers: 4,
    retainerLoyalty: 7,

    listenDoor: "1-in-6",
    openDoor: "",
    secretDoor: "1-in-6",
    findTrap: "1-in-6",

    baseMove: 120,
    overlandMove: 24,
    encounterMove: 40,

    languages: "Common",
    literate: true,

    weapons: [{ name: "", damage: "", ranged: false }],

    inventoryMode: "basic",
    basicInventory: { armourType: "unarmoured", carryingTreasure: false, equipment: "", weaponsArmour: "", magicItems: "", treasure: "" },
    detailedInventory: {
      equipment: [{ name: "", weight: 0 }],
      weaponsArmour: [{ name: "", weight: 0 }],
      magicItems: [{ name: "", weight: 0 }],
      treasure: [{ name: "", weight: 0 }],
    },
    itemBasedInventory: {
      unencumbering: "",
      equipped: ["", "", "", "", "", ""],
      packed: Array(20).fill(""),
    },
    coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },

    classFeatures: { cleric: false, magicUser: false, thief: false },
    spellLevels: Array.from({ length: 6 }, () => ({ slots: 0, used: 0, known: "" })),

    otherNotes: "",

    xp: 0,
    xpNext: 0,
    xpPercent: "",
  };
}

/**
 * Fills in any fields missing from stored data with sane defaults. Needed
 * because characters saved under an older version of this schema (before
 * a field was added, or before the whole shape changed) would otherwise
 * crash the sheet when it tries to read something that isn't there -
 * this makes old data load safely instead, healing itself as you edit it.
 */
export function healCharacter(raw: Partial<Character> & { id: string; ownerId?: string }): Character {
  const blank = blankCharacter(raw.id, raw.ownerId ?? "unknown");
  // Old saved data used inventoryMode "standard" before Basic/Detailed were split out - treat it as Basic.
  const inventoryMode: InventoryMode = (raw.inventoryMode as string) === "standard" ? "basic" : (raw.inventoryMode ?? blank.inventoryMode);
  const oldStandard = (raw as unknown as { standardInventory?: Partial<BasicInventory> }).standardInventory;
  return {
    ...blank,
    ...raw,
    inventoryMode,
    abilities: { ...blank.abilities, ...raw.abilities },
    saves: { ...blank.saves, ...raw.saves },
    basicInventory: { ...blank.basicInventory, ...oldStandard, ...raw.basicInventory },
    detailedInventory: {
      equipment: raw.detailedInventory?.equipment ?? blank.detailedInventory.equipment,
      weaponsArmour: raw.detailedInventory?.weaponsArmour ?? blank.detailedInventory.weaponsArmour,
      magicItems: raw.detailedInventory?.magicItems ?? blank.detailedInventory.magicItems,
      treasure: raw.detailedInventory?.treasure ?? blank.detailedInventory.treasure,
    },
    itemBasedInventory: {
      unencumbering: raw.itemBasedInventory?.unencumbering ?? blank.itemBasedInventory.unencumbering,
      equipped: raw.itemBasedInventory?.equipped?.length ? raw.itemBasedInventory.equipped : blank.itemBasedInventory.equipped,
      packed: raw.itemBasedInventory?.packed?.length ? raw.itemBasedInventory.packed : blank.itemBasedInventory.packed,
    },
    coins: { ...blank.coins, ...raw.coins },
    classFeatures: { ...blank.classFeatures, ...raw.classFeatures },
    spellLevels: raw.spellLevels?.length === 6 ? raw.spellLevels : blank.spellLevels,
    weapons: raw.weapons?.length ? raw.weapons : blank.weapons,
  };
}
