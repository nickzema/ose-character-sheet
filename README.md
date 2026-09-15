# OSE Character Sheets — Owlbear Rodeo extension

A full party-roster character sheet extension for Old-School Essentials
(Ascending AC variant), matching the two-column print-form layout of the
official AAC character sheet.

## Run locally

```
npm install
npm run dev
```

Add the local manifest URL Vite prints (e.g. `http://localhost:5173/manifest.json`)
to Owlbear Rodeo from your profile.

## Deploy

```
npm run build
```

Push to GitHub, Render redeploys automatically from the connected repo.
Update the extension's install link in Owlbear Rodeo to the hosted
`manifest.json` if it ever changes.

## What's in this version

- Full two-column character sheet: identity, abilities with modifiers,
  saving throws, combat, weapons, encounters, exploration, movement,
  languages
- Sheet-color picker (7 swatches), PC/NPC toggle, portrait upload
- **Inventory**, toggleable per character between **Standard** (four
  freeform boxes: Equipment / Weapons & Armour / Magic Items / Treasure)
  and **Item-Based** (the full Unencumbering/Equipped/Packed slot-tracking
  table with the movement-rate ladder, built as a real HTML table with
  `rowspan` merges so the ladder can't drift out of alignment)
- **Class Features**: Thief Skills, Turn Undead (full reference table),
  and Spells (6 levels, slot count + checkboxes, per-level spell list)
- Other Notes, Coins, XP footer
- Party list: portrait-aware roster cards, graph-paper background,
  hover lift, sorted PCs-then-NPCs

## Dice rolling

Clicking the die icon next to a weapon rolls a d20 attack (+ attack bonus,
+ STR or DEX modifier depending on melee/ranged) and the weapon's damage
die (+ the same ability modifier), using
**[Dice+](https://extensions.owlbear.rodeo/dice-plus)**'s documented
broadcast API (`dice-plus/roll-request` → `{source}/roll-result`). If
Dice+ isn't installed in the room, it falls back to a local Math.random
roll and shows the result as an Owlbear notification, so rolling always
works either way — Dice+ is optional, not required.

## Right-click a token to set its portrait

Right-click any token on the Character layer and choose **"Assign to
PC/NPC"**. A small popover lists your party; pick one and that token's
image becomes the character's portrait, and the party-list card for that
character switches from a flat color chip to the token's image (with the
row itself tinted in that character's sheet color). You can still upload
a different image manually from the sheet's portrait box at any time,
which overrides the token link.

This uses Owlbear's documented Context Menu API
(`OBR.contextMenu.create`, filtered to `layer: "CHARACTER"`) and opens a
second instance of this same app (`?assign=1&tokenId=...`) as a popover
anchored to the token.

## Known limits

- Room metadata caps at 16kB total, shared with every other extension in
  the room. Token-assigned portraits are just a URL (cheap). **Manually
  uploaded** portraits are stored as data URLs and can be large — if
  saving the roster fails because storage is full, the app automatically
  drops manual portraits (keeping token-linked ones) and tells the user
  why. For a portrait that reliably persists and syncs to everyone,
  assigning a token is the more robust path.
- The context menu is registered when the extension's panel is open. If
  you close the panel entirely, right-click-to-assign stops working until
  you reopen it — this matches how most OBR extensions with a popover-only
  UI behave, since there's no background script keeping it alive
  otherwise.
- This has been type-checked and build-verified (`tsc` + `vite build`
  both pass clean) but not yet run inside an actual Owlbear Rodeo room —
  that's the next step once it's deployed.
