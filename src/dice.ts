import OBR from "@owlbear-rodeo/sdk";

const SOURCE = "com.p4p.ose-character-sheet";

interface DiceGroup {
  description?: string;
  diceType: string;
  dice: { value: number; kept: boolean }[];
  total: number;
  isNegative?: boolean;
}

interface RollResult {
  rollId: string;
  totalValue: number;
  rollSummary: string;
  groups: DiceGroup[];
}

/** One labeled part of a roll (e.g. "Longsword" attack, or "Damage") with
 *  its own total and the individual die values that made it up, so the UI
 *  can show a clean breakdown instead of a flat text summary. */
export interface RollPart {
  label: string;
  total: number;
  dice: number[];
}

export interface RollOutcome {
  total: number;
  parts: RollPart[];
  /** True whenever this specific roll did NOT come from Dice+ - either
   *  because Dice+ isn't in the room, or (rare) because it didn't respond
   *  in time. The UI should always say so when this is true, rather than
   *  showing a number that might silently disagree with what Dice+ itself
   *  displays a moment later. */
  usedFallback: boolean;
  fallbackReason?: "not-detected" | "timeout";
}

let readyCache: boolean | null = null;

/** Check whether Dice+ is installed and responding. A positive result is
 *  cached for the session, but a negative one is NOT - Dice+ may simply
 *  not have finished loading yet when the first roll happens, so every
 *  roll gets its own chance to detect it rather than being locked out
 *  permanently by one early miss. */
export async function isDicePlusReady(): Promise<boolean> {
  if (readyCache === true) return true;
  const requestId = crypto.randomUUID();

  const result = await new Promise<boolean>((resolve) => {
    const unsubscribe = OBR.broadcast.onMessage("dice-plus/isReady", (event) => {
      const data = event.data as { requestId?: string; ready?: boolean };
      if (data.ready && data.requestId === requestId) {
        unsubscribe();
        resolve(true);
      }
    });
    OBR.broadcast.sendMessage("dice-plus/isReady", { requestId, timestamp: Date.now() }, { destination: "ALL" });
    setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, 1500);
  });

  if (result) readyCache = true;
  return result;
}

/**
 * Send a roll to Dice+ and resolve with its result, broken into labeled
 * parts (one per comma-separated notation group) rather than Dice+'s own
 * flat summary string, so the UI can lay each part out cleanly instead of
 * dumping raw text. Once Dice+ is confirmed present, this WAITS for its
 * real response rather than racing a short timeout - a short timeout that
 * gives up and substitutes a different local random roll is exactly what
 * caused rolls to visibly disagree with what Dice+ actually showed. The
 * 20s ceiling below is just a sanity net for a genuinely broken
 * connection, not a normal code path.
 */
export async function rollNotation(notation: string): Promise<RollOutcome> {
  const ready = await isDicePlusReady();
  if (!ready) {
    return { ...localRoll(notation), usedFallback: true, fallbackReason: "not-detected" };
  }

  const rollId = `roll_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const playerId = await OBR.player.getId();
  const playerName = await OBR.player.getName();

  return new Promise((resolve) => {
    const unsubResult = OBR.broadcast.onMessage(`${SOURCE}/roll-result`, (event) => {
      const data = event.data as { rollId: string; result: RollResult };
      if (data.rollId !== rollId) return;
      unsubResult();
      unsubError();
      const parts: RollPart[] = data.result.groups.map((g) => ({
        label: g.description || g.diceType,
        total: g.total,
        dice: g.dice.filter((d) => d.kept).map((d) => d.value),
      }));
      resolve({ total: data.result.totalValue, parts, usedFallback: false });
    });
    const unsubError = OBR.broadcast.onMessage(`${SOURCE}/roll-error`, (event) => {
      const data = event.data as { rollId: string; error: string };
      if (data.rollId !== rollId) return;
      unsubResult();
      unsubError();
      // Dice+ reported an error rolling our own notation - fall back locally.
      resolve({ ...localRoll(notation), usedFallback: true, fallbackReason: "not-detected" });
    });

    OBR.broadcast.sendMessage(
      "dice-plus/roll-request",
      {
        rollId,
        playerId,
        playerName,
        rollTarget: "everyone",
        diceNotation: notation,
        showResults: true,
        timestamp: Date.now(),
        source: SOURCE,
      },
      { destination: "ALL" }
    );

    // Sanity net only - Dice+ is confirmed present, so this should not
    // normally fire. If it does, say so honestly instead of quietly
    // substituting a different random result.
    setTimeout(() => {
      unsubResult();
      unsubError();
      resolve({ ...localRoll(notation), usedFallback: true, fallbackReason: "timeout" });
    }, 20000);
  });
}

/** Builds "+2+2" style notation from separate modifier sources, so the roll
 *  shows where each part came from instead of a single pre-summed number.
 *  Zero terms are dropped; if everything's zero this returns "". */
export function termString(terms: number[]): string {
  return terms
    .filter((t) => t !== 0)
    .map((t) => (t >= 0 ? `+${t}` : `${t}`))
    .join("");
}

/** Roll an attack + damage pair for a weapon. attackBonus and hitAbilityMod
 *  are kept as separate addends (not pre-summed) so the roll notation shows
 *  each source, e.g. "1d20+2+2" instead of "1d20+4". dmgMod is added to the
 *  damage roll - pass 0 for ranged weapons, since only STR (melee) adds to
 *  damage in OSE, never the attack bonus or DEX. Returns attack and damage
 *  as separate labeled parts for a clean two-row display. */
export async function rollWeapon(
  _weaponName: string,
  damage: string,
  attackBonus: number,
  hitAbilityMod: number,
  dmgMod: number,
  magicBonus: number = 0
): Promise<RollOutcome> {
  const dmg = damage.trim().toLowerCase().startsWith("d") ? `1${damage.trim()}` : damage.trim();
  const atkMod = attackBonus + hitAbilityMod + magicBonus;
  const dmgTotalMod = dmgMod + magicBonus;
  const atkPart = `1d20${termString([attackBonus, hitAbilityMod, magicBonus])} #Attack`;
  const dmgPart = `${dmg}${termString([dmgMod, magicBonus])} #Damage`;
  const result = await rollNotation(`${atkPart}, ${dmgPart}`);

  // This is a comma-separated "multiple rolls at once" notation, and per
  // Dice+'s own docs each returned group's `total` is only the sum of the
  // KEPT DICE - flat modifiers (our +3 attack bonus, +1 STR, etc.) are
  // never folded in, and there's no separate "per-row total" field to
  // read instead; Dice+'s docs say the caller is expected to recompute
  // per-row totals itself from `groups` + the notation it sent. We
  // already know these modifiers (we built the notation right above), so
  // add them in ourselves rather than showing Dice+'s dice-only
  // subtotal - which is what was making the banner disagree with Dice+'s
  // own displayed result.
  if (!result.usedFallback && result.parts.length >= 2) {
    result.parts = [
      { ...result.parts[0], label: "Attack", total: result.parts[0].total + atkMod },
      { ...result.parts[1], label: "Damage", total: result.parts[1].total + dmgTotalMod },
    ];
  }
  return result;
}

function localRoll(notation: string): Omit<RollOutcome, "usedFallback" | "fallbackReason"> {
  const rawParts = notation.split(",").map((p) => p.trim());
  const parts: RollPart[] = [];
  let firstTotal = 0;

  rawParts.forEach((part, i) => {
    const [dicePart, labelPart] = part.split("#").map((s) => s.trim());
    const match = dicePart.match(/^(\d+)d(\d+)((?:[+-]\d+)*)$/i);
    const label = labelPart || `Roll ${i + 1}`;
    if (!match) {
      parts.push({ label, total: 0, dice: [] });
      return;
    }
    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const modTerms = match[3] ? match[3].match(/[+-]\d+/g) || [] : [];
    const mod = modTerms.reduce((sum, t) => sum + parseInt(t, 10), 0);
    const dice = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    const total = dice.reduce((a, b) => a + b, 0) + mod;
    if (i === 0) firstTotal = total;
    parts.push({ label, total, dice });
  });

  return { total: firstTotal, parts };
}
