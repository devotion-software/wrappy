# Wishful — design handoff

Designs for a wish list + Secret Santa web app, in the "Notebook" style.

## What's here

- `DESIGN.md` — the full spec: colour tokens (light + dark), fonts, components, page-by-page breakdown and the product rules (no-spoilers, reserve/bought states, Secret Santa flow).
- `pages/` — the five key screens as standalone HTML files. Open them in a browser.
  - `landing.html`, `login.html`, `home.html` — static
  - `list.html`, `invite.html` — clickable (toggle views, reserve / mark as bought / undo, join the Secret Santa)
  - Add `?theme=dark` to any page URL to see dark mode (e.g. `pages/list.html?theme=dark`).
- `index.html` — links to every page in light and dark.

`list.html` and `invite.html` use a tiny inline preview script to make them clickable. It's for viewing only — rebuild those screens as proper components.

## Using it with Claude Code

1. Put this folder in your project as `design/`.
2. Start Claude Code in the project and give it something like:

> Build a wish list + Secret Santa web app based on the designs in `design/`. Read `design/DESIGN.md` first — it's the spec. Match the look of the HTML files in `design/pages/` closely (colours, fonts, spacing, components), including dark mode. Set the colour tokens up as theme variables and build the paper sheet, hand-drawn checkbox, buttons and sticky note as reusable components. Follow the product rules in section 8, especially that list owners must never see what's been reserved or bought. Ask me about the tech stack before you start.
