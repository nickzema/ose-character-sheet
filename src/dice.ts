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

let readyCache: boolean | null = null;

/** Check whether Dice+ is installed and responding. Cached for the session. */
export async function isDicePlusReady(): Promise<boolean> {
  if (readyCache !== null) return readyCache;
  const requestId = crypto.randomUUID();

  readyCache = await new Promise<boolean>((resolve) => {
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
    }, 1000);
  });

  return readyCache;
}

/**
 * Send a roll to Dice+ and resolve with its result. Falls back to a local
 * Math.random roll (parsing only the simple "NdM+K" shapes this app sends)
 * if Dice+ isn't installed, so rolling still works either way.
 */
export async function rollNotation(notation: string, label: string): Promise<{ summary: string; total: number }> {
  const ready = await isDicePlusReady();
  if (!ready) {
    return localRoll(notation, label);
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
      resolve({ summary: data.result.rollSummary, total: data.result.totalValue });
    });
    const unsubError = OBR.broadcast.onMessage(`${SOURCE}/roll-error`, (event) => {
      const data = event.data as { rollId: string; error: string };
      if (data.rollId !== rollId) return;
      unsubResult();
      unsubError();
      // Dice+ reported an error rolling our own notation - fall back locally.
      localRoll(notation, label).then(resolve);
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

    // Dice+ not responding for this particular roll - don't hang forever.
    setTimeout(() => {
      unsubResult();
      unsubError();
      localRoll(notation, label).then(resolve);
    }, 4000);
  });
}

/** Roll an attack + damage pair for a weapon, using the character's modifiers.
 *  hitMod is added to the attack roll (attack bonus + STR or DEX, per weapon).
 *  dmgMod is added to the damage roll - pass 0 for ranged weapons, since only
 *  STR (melee) adds to damage in OSE, never the attack bonus or DEX. */
export async function rollWeapon(
  weaponName: string,
  damage: string,
  hitMod: number,
  dmgMod: number
): Promise<{ summary: string; total: number }> {
  const dmg = damage.trim().toLowerCase().startsWith("d") ? `1${damage.trim()}` : damage.trim();
  const atkPart = `1d20${hitMod >= 0 ? "+" : ""}${hitMod} #${weaponName || "Attack"}`;
  const dmgPart = dmgMod !== 0 ? `${dmg}${dmgMod >= 0 ? "+" : ""}${dmgMod} #Damage` : `${dmg} #Damage`;
  return rollNotation(`${atkPart}, ${dmgPart}`, weaponName || "Weapon");
}

async function localRoll(notation: string, label: string): Promise<{ summary: string; total: number }> {
  const parts = notation.split(",").map((p) => p.trim());
  const summaries: string[] = [];
  let firstTotal = 0;

  parts.forEach((part, i) => {
    const withoutLabel = part.split("#")[0].trim();
    const match = withoutLabel.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (!match) {
      summaries.push(part);
      return;
    }
    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const mod = match[3] ? parseInt(match[3], 10) : 0;
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    const sum = rolls.reduce((a, b) => a + b, 0) + mod;
    if (i === 0) firstTotal = sum;
    summaries.push(`[${rolls.join(", ")}]${mod ? (mod > 0 ? `+${mod}` : mod) : ""} = ${sum}`);
  });

  const summary = `${label} (local roll, Dice+ not detected): ${summaries.join(" | ")}`;
  OBR.notification.show(summary);
  return { summary, total: firstTotal };
}
