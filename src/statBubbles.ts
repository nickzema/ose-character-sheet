import OBR, { isImage } from "@owlbear-rodeo/sdk";
import type { Character } from "./types";

// Confirmed from Stat Bubbles for D&D's own source (SeamusFinlayson/Bubbles-for-Owlbear-Rodeo):
// getPluginId("metadata") = `com.owlbear-rodeo-bubbles-extension/metadata`, and inside that
// object the fields are literally "health", "max health", "armor class" (with spaces).
const STAT_BUBBLES_KEY = "com.owlbear-rodeo-bubbles-extension/metadata";

/**
 * Push this character's name, HP and AC to its linked token, if it has one.
 * - Name goes to the token's label (the text shown under it) and its item name.
 *   A blank sheet name leaves the token's existing label alone.
 * - HP/AC go to Stat Bubbles for D&D's metadata (if installed in the room).
 * One-way only: this sheet is the source of truth - editing the token or the
 * bubble directly does not flow back.
 */
export async function syncLinkedToken(character: Character) {
  if (!character.linkedTokenId) return;
  const name = character.name.trim();
  try {
    await OBR.scene.items.updateItems([character.linkedTokenId], (items) => {
      for (const item of items) {
        if (name) {
          if (item.name !== name) item.name = name;
          // Set both plain and rich forms so the label updates either way.
          if (isImage(item) && item.text.plainText !== name) {
            item.text.plainText = name;
            item.text.richText = [{ type: "paragraph", children: [{ text: name }] }];
          }
        }

        const existing = (item.metadata[STAT_BUBBLES_KEY] as Record<string, unknown>) || {};
        if (
          existing.health !== character.hpCurrent ||
          existing["max health"] !== character.hpMax ||
          existing["armor class"] !== character.ac
        ) {
          item.metadata[STAT_BUBBLES_KEY] = {
            ...existing,
            health: character.hpCurrent,
            "max health": character.hpMax,
            "armor class": character.ac,
          };
        }
      }
    });
  } catch {
    // The linked token may have been deleted from the scene since - not critical, fail silently.
  }
}
