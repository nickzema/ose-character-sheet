# OSE Character Sheets — Owlbear Rodeo extension

A standalone party roster for Old-School Essentials (Ascending AC variant),
built as an Owlbear Rodeo extension. Not tied to tokens — click the action
icon to open the panel and see every character in the room.

## Run locally

```
npm install
npm run dev
```

Then in Owlbear Rodeo, add the extension from your profile using the local
manifest URL Vite prints (something like `http://localhost:5173/manifest.json`).

## Deploy

```
npm run build
```

Upload the contents of `dist/` to any static host (Render, Cloudflare Pages,
Vercel, etc. — see Owlbear's hosting tutorial). Then add the hosted
`manifest.json` URL as your extension's install link.

## How it works

- Characters are stored in **room metadata** (`com.p4p.ose-character-sheet/roster`),
  so the whole party — GM and players — sees the same live roster.
- Any player can add a character; they own it. The GM can edit/delete anyone's.
  A player can edit only their own.
- Ability modifiers, unarmoured AC, melee/missile totals, and movement rates
  (overland/exploration/encounter) are computed automatically from the OSE SRD
  tables. HP, AC, attack bonus, and saving throws are entered directly, same
  as the paper sheet — OSE derives those from class/level tables this app
  doesn't embed.

## Known limits

- Room metadata is capped at 16kB **total**, shared with any other extensions
  enabled in the room. Comfortable for a normal-size party; if the roster
  grows very large (many NPCs, long notes) it may need to move to a different
  storage strategy.
- Item-slot encumbrance (the STR-scaled slot/movement table from the AAC
  encumbrance sheet) isn't auto-tracked — equipment is free-text for now.
