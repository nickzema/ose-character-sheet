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

export interface RollOutcome {
  summary: string;
  total: number;
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
 * Send a roll to Dice+ and resolve with its result. Once Dice+ is confirmed
 * present, this WAITS for its real response rather than racing a short
 * timeout - a short timeout that gives up and substitutes a different local
 * random roll is exactly what caused rolls to visibly disagree with what
 * Dice+ actually showed. The 20s ceiling below is just a sanity net for a
 * genuinely broken connection, not a normal code path.
 */
export async function rollNotation(notation: string, _label: string): Promise<RollOutcome> {
  const ready = await isDicePlusReady();
  if (!ready) {
    const r = await localRoll(notation);
    return { ...r, usedFallback: true, fallbackReason: "not-detected" };
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
      resolve({ summary: data.result.rollSummary, total: data.result.totalValue, usedFallback: false });
    });
    const unsubError = OBR.broadcast.onMessage(`${SOURCE}/roll-error`, (event) => {
      const data = event.data as { rollId: string; error: string };
      if (data.rollId !== rollId) return;
      unsubResult();
      unsubError();
      // Dice+ reported an error rolling our own notation - fall back locally.
      localRoll(notation).then((r) => resolve({ ...r, usedFallback: true, fallbackReason: "not-detected" }));
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
      localRoll(notation).then((r) => resolve({ ...r, usedFallback: true, fallbackReason: "timeout" }));
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
 *  damage in OSE, never the attack bonus or DEX. */
export async function rollWeapon(
  weaponName: string,
  damage: string,
  attackBonus: number,
  hitAbilityMod: number,
  dmgMod: number
): Promise<RollOutcome> {
  const dmg = damage.trim().toLowerCase().startsWith("d") ? `1${damage.trim()}` : damage.trim();
  const atkPart = `1d20${termString([attackBonus, hitAbilityMod])} #${weaponName || "Attack"}`;
  const dmgPart = `${dmg}${termString([dmgMod])} #Damage`;
  return rollNotation(`${atkPart}, ${dmgPart}`, weaponName || "Weapon");
}

async function localRoll(notation: string): Promise<{ summary: string; total: number }> {
  const parts = notation.split(",").map((p) => p.trim());
  const summaries: string[] = [];
  let firstTotal = 0;

  parts.forEach((part, i) => {
    const withoutLabel = part.split("#")[0].trim();
    const match = withoutLabel.match(/^(\d+)d(\d+)((?:[+-]\d+)*)$/i);
    if (!match) {
      summaries.push(part);
      return;
    }
    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const modTerms = match[3] ? match[3].match(/[+-]\d+/g) || [] : [];
    const mod = modTerms.reduce((sum, t) => sum + parseInt(t, 10), 0);
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    const sum = rolls.reduce((a, b) => a + b, 0) + mod;
    if (i === 0) firstTotal = sum;
    const modLabel = modTerms.length ? modTerms.join("") : "";
    summaries.push(`[${rolls.join(", ")}]${modLabel} = ${sum}`);
  });

  const summary = `${summaries.join(" | ")}`;
  return { summary, total: firstTotal };
}
