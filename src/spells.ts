// Transcribed directly from the project's OSE Classic: Spells rulebook
// (Cleric Spell List / Magic-User Spell List). Name only, no descriptions.
// Cleric spells only go up to 5th level in Classic OSE - level 6 is empty.

export const CLERIC_SPELLS: string[][] = [
  [], // index 0 unused (levels are 1-indexed below)
  ["Cure Light Wounds (Cause Lt. Wounds)", "Detect Evil", "Detect Magic", "Light (Darkness)", "Protection from Evil", "Purify Food and Water", "Remove Fear (Cause Fear)", "Resist Cold"],
  ["Bless (Blight)", "Find Traps", "Hold Person", "Know Alignment", "Resist Fire", "Silence 15' Radius", "Snake Charm", "Speak with Animals"],
  ["Continual Light (Continual Darkness)", "Cure Disease (Cause Disease)", "Growth of Animal", "Locate Object", "Remove Curse (Curse)", "Striking"],
  ["Create Water", "Cure Serious Wounds (Cause Sr. Wounds)", "Neutralize Poison", "Protection from Evil 10' Radius", "Speak with Plants", "Sticks to Snakes"],
  ["Commune", "Create Food", "Dispel Evil", "Insect Plague", "Quest (Remove Quest)", "Raise Dead (Finger of Death)"],
  [], // Clerics don't get 6th level spells in Classic OSE
];

export const MAGIC_USER_SPELLS: string[][] = [
  [],
  ["Charm Person", "Detect Magic", "Floating Disc", "Hold Portal", "Light (Darkness)", "Magic Missile", "Protection from Evil", "Read Languages", "Read Magic", "Shield", "Sleep", "Ventriloquism"],
  ["Continual Light (Continual Darkness)", "Detect Evil", "Detect Invisible", "ESP", "Invisibility", "Knock", "Levitate", "Locate Object", "Mirror Image", "Phantasmal Force", "Web", "Wizard Lock"],
  ["Clairvoyance", "Dispel Magic", "Fire Ball", "Fly", "Haste", "Hold Person", "Infravision", "Invisibility 10' Radius", "Lightning Bolt", "Protection from Evil 10' Radius", "Protection from Normal Missiles", "Water Breathing"],
  ["Charm Monster", "Confusion", "Dimension Door", "Growth of Plants", "Hallucinatory Terrain", "Massmorph", "Polymorph Others", "Polymorph Self", "Remove Curse (Curse)", "Wall of Fire", "Wall of Ice", "Wizard Eye"],
  ["Animate Dead", "Cloudkill", "Conjure Elemental", "Contact Higher Plane", "Feeblemind", "Hold Monster", "Magic Jar", "Pass-Wall", "Telekinesis", "Teleport", "Transmute Rock to Mud (Mud to Rock)", "Wall of Stone"],
  ["Anti-Magic Shell", "Control Weather", "Death Spell", "Disintegrate", "Geas (Remove Geas)", "Invisible Stalker", "Lower Water", "Move Earth", "Part Water", "Projected Image", "Reincarnation", "Stone to Flesh (Flesh to Stone)"],
];
