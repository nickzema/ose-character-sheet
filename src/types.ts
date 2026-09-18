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
  bonus: string; // magic weapon bonus, e.g. "+1" - applies to both attack and damage
  ranged: boolean; // false = melee (uses STR/Mel), true = missile (uses DEX/Mis)
}

export interface MemorizedSpell {
  name: string;
  level: number; // 1-6
  used: boolean; // cast/expended today
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

export interface BasicPlusInventory {
  armourType: ArmourType;
  carryingTreasure: boolean;
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

export type InventoryMode = "basic" | "basic-plus" | "detailed" | "item";

export interface Character {
  id: string;
  ownerId: string; // OBR player id who created this character
  type: "PC" | "NPC";
  hidden: boolean; // GM-only: excluded from the roster players see
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
  basicPlusInventory: BasicPlusInventory;
  detailedInventory: DetailedInventory;
  itemBasedInventory: ItemBasedInventory;
  coins: Coins;

  classFeatures: {
    cleric: boolean;
    magicUser: boolean;
    thief: boolean;
  };
  // Memorized Spells - shared by Cleric and Magic-User, a growable list
  // (like Detailed Inventory) rather than a fixed slot count. Memorize the
  // same spell twice to cast it twice.
  memorizedSpells: MemorizedSpell[];
  // Magic-User only: the spellbook, chaptered by level (index 0 = Lv1 ...
  // index 5 = Lv6). Spells here are what CAN be memorized - not what's
  // currently memorized.
  spellbook: string[][];
  spellbookUnlockedLevels: number; // 1-6, how many chapters are revealed

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
    hidden: false,
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

    weapons: [{ name: "", damage: "", bonus: "", ranged: false }],

    inventoryMode: "basic",
    basicInventory: { armourType: "unarmoured", carryingTreasure: false, equipment: "", weaponsArmour: "", magicItems: "", treasure: "" },
    basicPlusInventory: {
      armourType: "unarmoured",
      carryingTreasure: false,
      equipment: [{ name: "", weight: 0 }],
      weaponsArmour: [{ name: "", weight: 0 }],
      magicItems: [{ name: "", weight: 0 }],
      treasure: [{ name: "", weight: 0 }],
    },
    detailedInventory: {
      equipment: [{ name: "", weight: 0 }],
      weaponsArmour: [{ name: "", weight: 0 }],
      magicItems: [{ name: "", weight: 0 }],
      treasure: [{ name: "", weight: 0 }],
    },
    itemBasedInventory: {
      unencumbering: "",
      equipped: Array(9).fill(""),
      packed: Array(19).fill(""),
    },
    coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },

    classFeatures: { cleric: false, magicUser: false, thief: false },
    memorizedSpells: [],
    spellbook: Array.from({ length: 6 }, () => []),
    spellbookUnlockedLevels: 1,

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
function resizeSlots(arr: string[] | undefined, length: number): string[] {
  const src = arr ?? [];
  return Array.from({ length }, (_, i) => src[i] ?? "");
}

export function healCharacter(raw: Partial<Character> & { id: string; ownerId?: string }): Character {
  const blank = blankCharacter(raw.id, raw.ownerId ?? "unknown");
  // Old saved data used inventoryMode "standard" before Basic/Detailed were split out - treat it as Basic.
  const inventoryMode: InventoryMode = (raw.inventoryMode as string) === "standard" ? "basic" : (raw.inventoryMode ?? blank.inventoryMode);
  const oldStandard = (raw as unknown as { standardInventory?: Partial<BasicInventory> }).standardInventory;

  // Migrate the old fixed-slot "spellLevels" schema (checkboxes + one
  // freeform "known" text field per level) into the new growable
  // memorized-spells list + per-level spellbook chapters. Best-effort:
  // splits each level's old text on commas/semicolons/newlines into
  // separate spell entries at that level, since that's the only level
  // information the old data carried.
  const oldSpellLevels = (raw as unknown as { spellLevels?: { known?: string }[] }).spellLevels;
  let memorizedSpells = raw.memorizedSpells;
  let spellbook = raw.spellbook;
  let spellbookUnlockedLevels = raw.spellbookUnlockedLevels;
  if (!memorizedSpells && oldSpellLevels?.length) {
    memorizedSpells = [];
    oldSpellLevels.forEach((lvl, i) => {
      (lvl.known || "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).forEach((name) => {
        memorizedSpells!.push({ name, level: i + 1, used: false });
      });
    });
  }
  if (!spellbook && oldSpellLevels?.length) {
    spellbook = Array.from({ length: 6 }, (_, i) =>
      (oldSpellLevels[i]?.known || "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
    );
    spellbookUnlockedLevels = spellbook.reduce((max, lvl, i) => (lvl.length ? i + 1 : max), 1);
  }

  return {
    ...blank,
    ...raw,
    inventoryMode,
    abilities: { ...blank.abilities, ...raw.abilities },
    saves: { ...blank.saves, ...raw.saves },
    basicInventory: { ...blank.basicInventory, ...oldStandard, ...raw.basicInventory },
    basicPlusInventory: {
      armourType: raw.basicPlusInventory?.armourType ?? blank.basicPlusInventory.armourType,
      carryingTreasure: raw.basicPlusInventory?.carryingTreasure ?? blank.basicPlusInventory.carryingTreasure,
      equipment: raw.basicPlusInventory?.equipment ?? blank.basicPlusInventory.equipment,
      weaponsArmour: raw.basicPlusInventory?.weaponsArmour ?? blank.basicPlusInventory.weaponsArmour,
      magicItems: raw.basicPlusInventory?.magicItems ?? blank.basicPlusInventory.magicItems,
      treasure: raw.basicPlusInventory?.treasure ?? blank.basicPlusInventory.treasure,
    },
    detailedInventory: {
      equipment: raw.detailedInventory?.equipment ?? blank.detailedInventory.equipment,
      weaponsArmour: raw.detailedInventory?.weaponsArmour ?? blank.detailedInventory.weaponsArmour,
      magicItems: raw.detailedInventory?.magicItems ?? blank.detailedInventory.magicItems,
      treasure: raw.detailedInventory?.treasure ?? blank.detailedInventory.treasure,
    },
    itemBasedInventory: {
      unencumbering: raw.itemBasedInventory?.unencumbering ?? blank.itemBasedInventory.unencumbering,
      // Resize to the current row counts (Equipped 9, Packed 19) rather
      // than just keeping whatever length was saved - the row count
      // itself changed (was wrongly 6/20 before), so old data needs to
      // be preserved by index and padded/trimmed to fit, not replaced
      // wholesale just because *a* length was already present.
      equipped: resizeSlots(raw.itemBasedInventory?.equipped, blank.itemBasedInventory.equipped.length),
      packed: resizeSlots(raw.itemBasedInventory?.packed, blank.itemBasedInventory.packed.length),
    },
    coins: { ...blank.coins, ...raw.coins },
    classFeatures: { ...blank.classFeatures, ...raw.classFeatures },
    memorizedSpells: memorizedSpells ?? blank.memorizedSpells,
    spellbook: spellbook?.length === 6 ? spellbook : blank.spellbook,
    spellbookUnlockedLevels: spellbookUnlockedLevels ?? blank.spellbookUnlockedLevels,
    weapons: raw.weapons?.length ? raw.weapons.map((w) => ({ ...w, bonus: w.bonus ?? "" })) : blank.weapons,
  };
}
