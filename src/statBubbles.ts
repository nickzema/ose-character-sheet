import OBR from "@owlbear-rodeo/sdk";
import type { Character } from "./types";

// Confirmed from Stat Bubbles for D&D's own source (SeamusFinlayson/Bubbles-for-Owlbear-Rodeo):
// getPluginId("metadata") = `com.owlbear-rodeo-bubbles-extension/metadata`, and inside that
// object the fields are literally "health", "max health", "armor class" (with spaces).
const STAT_BUBBLES_KEY = "com.owlbear-rodeo-bubbles-extension/metadata";

/**
 * Push this character's HP/AC to its linked token, if it has one, so Stat
 * Bubbles for D&D (if installed in the room) shows a matching health bar.
 * One-way only: this sheet is the source of truth, Stat Bubbles just
 * mirrors it - editing the bubble directly on the token does not flow back.
 */
export async function syncStatBubbles(character: Character) {
  if (!character.linkedTokenId) return;
  try {
    await OBR.scene.items.updateItems([character.linkedTokenId], (items) => {
      for (const item of items) {
        const existing = (item.metadata[STAT_BUBBLES_KEY] as Record<string, unknown>) || {};
        item.metadata[STAT_BUBBLES_KEY] = {
          ...existing,
          health: character.hpCurrent,
          "max health": character.hpMax,
          "armor class": character.ac,
        };
      }
    });
  } catch {
    // The linked token may have been deleted from the scene since - not critical, fail silently.
  }
}
