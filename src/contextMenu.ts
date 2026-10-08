import OBR, { isImage } from "@owlbear-rodeo/sdk";

const ID = "com.p4p.ose-character-sheet";

/**
 * Registers a right-click menu item on character-layer tokens. Clicking it
 * opens a small popover (src/AssignPortraitPopover.tsx, routed via the
 * ?assign= query param) listing the party so the user can pick who this
 * token belongs to. The token's image becomes that character's portrait;
 * a manual upload from the sheet's portrait box always overrides it.
 */
export function setupContextMenu() {
  const register = (suffix: string, label: string, kind: "character" | "retainer") =>
    OBR.contextMenu.create({
      id: `${ID}/${suffix}`,
      icons: [
        {
          icon: "/portrait-icon.svg",
          label,
          filter: {
            every: [
              { key: "layer", value: "CHARACTER" },
              { key: "type", value: "IMAGE" },
            ],
            max: 1,
          },
        },
      ],
      onClick(context, elementId) {
        const item = context.items[0];
        if (!item || !isImage(item)) return;

        const params = new URLSearchParams({
          assign: "1",
          kind,
          tokenId: item.id,
          imageUrl: item.image.url,
          tokenName: item.text?.plainText || item.name || "Token",
        });

        OBR.popover.open({
          id: `${ID}/assign-popover`,
          url: `/?${params.toString()}`,
          height: 360,
          width: 300,
          anchorElementId: elementId,
        });
      },
    });

  register("assign-portrait", "Assign to PC/NPC", "character");
  register("assign-retainer", "Assign to Retainer", "retainer");
}
