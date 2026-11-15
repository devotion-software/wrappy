# Wishful — design spec ("Notebook" style)

"Wishful" is a placeholder product name. Anything in [SQUARE BRACKETS] (prices, dates, budgets, share links, places) is placeholder content.

The reference pages in `pages/` are the source of truth for look and layout. This document explains the system behind them and the product rules they illustrate.

---

## 1. Product in one paragraph

People write wish lists, share one link with friends and family, and friends quietly reserve gifts so nobody doubles up. The list owner never sees what has been reserved or bought, so the surprise is kept. The app also runs Secret Santa exchanges: an organiser invites people, everyone picks a wish list to share, names are drawn automatically, and each person privately learns who they're buying for.

Design goals: clean, extremely intuitive, smart and modern — with the warmth of a list written on paper.

---

## 2. The idea behind the style

Every list is a **sheet of ruled notebook paper** sitting on a desk:

- The page background is the "desk" (`--desk`); content lives on "paper" (`--paper`) sheets.
- Sheets have a **gold margin line** down the left, an optional **strip of tape** at the top, a soft shadow, a 4px radius, and sometimes a tiny rotation (−1.5° to +1.2°) so they feel placed by hand.
- Ticking something off uses a **hand-drawn checkbox** and a **gold tick**; done items get a **gold strike-through**.
- Everything is grayscale. **Gold is the only accent**, reserved for things that matter: primary buttons, ticks, strike-throughs, the margin line, "most wanted" stars and small handwritten status notes.

Keep the paper metaphor light. It's a feeling, not a skeuomorphic costume: no paper textures, no torn edges, no drop-shadowed fake pins.

---

## 3. Colour tokens

Defined as CSS custom properties at the top of every page. Dark mode applies automatically via `prefers-color-scheme`, and can be forced with `<html data-theme="dark">` or `data-theme="light"`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--desk` | `#ECECEA` | `#0E0E0E` | Page background, avatar fills, active nav pill |
| `--paper` | `#FAFAF8` | `#1A1A1A` | Cards / sheets, header bar |
| `--ink` | `#1C1C1C` | `#ECEAE4` | Primary text, outlines, dark buttons |
| `--ink2` | `#4A4A4A` | `#C9C7C1` | Secondary text |
| `--muted` | `#5E5E5A` | `#A8A8A4` | Meta text (prices, dates, counts) |
| `--faint` | `#6E6E6A` | `#9C9A94` | Struck-through / inactive item names |
| `--rule` | `#E4E4E0` | `#2A2A2A` | Ruled lines between rows |
| `--line` | `#D2D2CE` | `#333333` | Borders, dividers, dashed "new" outlines |
| `--gold` | `#C9A24A` | `#D9B65E` | Accent fills and strokes |
| `--gold-text` | `#8A6A1F` | `#D9B65E` | Gold used as text (darker in light mode for contrast) |
| `--on-gold` | `#1C1C1C` | `#141414` | Text on gold buttons |
| `--gold-soft` | `#F4EEDD` | `#2A261C` | Sticky notes, Secret Santa cards, confirmation panels |
| `--tape` | `rgba(160,160,155,.28)` | `rgba(200,200,195,.16)` | Tape strip |
| `--shadow` | soft 2-layer shadow | 1px hairline ring | Sheet elevation |

Rule: never put gold text on paper in light mode using `--gold` — use `--gold-text`. All text/background pairs meet WCAG AA (4.5:1).

---

## 4. Typography

Three Google Fonts, each with one job. The handwriting never gets in the way of reading.

| Font | Role | Typical sizes |
|---|---|---|
| **Caveat** (500, 700) | Personality: page and list titles, logo, handwritten status notes ("reserved", "you're getting this"), step numbers | 22px notes · 32–40px card titles · 52–96px page headlines |
| **Patrick Hand** | Item names and anything the user "wrote": wishes, names, list previews, form input text | 19–24px (never below 19px) |
| **Inter** (400, 500, 600) | All UI: body copy, buttons, labels, prices, metadata | 12–13px meta · 14–15px UI · 16–18px body |

- Item names must stay very readable: always Patrick Hand at 19px+, in `--ink`.
- Buttons are always Inter so they read as controls, never handwriting.
- Line height: 1.5–1.6 for Inter body, ~0.9–1.0 for big Caveat headlines.

---

## 5. Components

**Paper sheet** — `background: var(--paper)`, radius 4px, `box-shadow: var(--shadow)`. Left padding leaves room for the margin line.
- *Margin line*: absolutely positioned 2px `--gold` bar, ~40–50px from the left edge, full height.
- *Tape*: 110×24px `--tape` rectangle centred on the top edge, offset −11px, rotated −3°. Use on hero/feature sheets only (one per sheet).

**Ruled rows** — list items separated by a 1px `--rule` bottom border; ~16px vertical padding.

**Hand-drawn checkbox** — 22–24px square, 1.5px `--ink` border, radius 3px, each one rotated a slightly different amount (between −3° and +2.5°). Checked state shows a gold hand-drawn tick (`M4 13c2 1.5 3.5 3.5 4.5 5.5C11 12 15 7 21 3`, stroke-width 3).

**Struck item** — name in `--faint`, `text-decoration: line-through`, decoration colour `--gold`, thickness 2px, plus a Caveat note in `--gold-text` on the right.

**Buttons** (all pill-shaped, min height 40px, primary 44–54px, Inter 600):
- *Primary*: `--gold` background, `--on-gold` text. One per view.
- *Dark*: `--ink` background, `--paper` text (secondary emphasis, e.g. "Add", "Done").
- *Outline*: transparent, 1.5px `--ink` border.
- *Quiet*: 1px `--line` border (social sign-in).
- *Text*: underlined Inter for "Undo", "Leave", etc.

**Sticky note** — `--gold-soft` block, no radius, shadow, rotated ±1–3°. Used for Secret Santa status ("You're buying for Sam").

**Inputs** — no box: transparent background with a 1.5px `--ink` bottom border, like writing on a line. Text typed by the user is Patrick Hand 22px. Labels are Inter 13px 600 above the line.

**Avatars** — circles with initials (Inter 600) on `--desk`. Overlapping stack with a 2px `--paper` ring.

**Segmented toggle** — pill container with `--line` border; active segment is `--ink` with `--paper` text. Uses `aria-pressed`.

**Icons** — simple stroke icons (1.8px, round caps/joins), inherit `currentColor`. Gold filled star = "most wanted". No emoji.

**Focus** — `:focus-visible` gets a 2px `--gold` outline with 2px offset.

---

## 6. Layout

- Max content widths: 1200–1240px; centred; 24px side padding.
- Layouts use flex-wrap/grid with `auto-fit` so they collapse to one column on phones (sidebars drop below main content).
- Touch targets ≥ 44px.
- Spacing scale used: 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 96px.

---

## 7. Pages

### Landing (`pages/landing.html`)
Hero headline "Write it down. Share it. Keep the surprise." with a taped paper list and a Secret Santa sticky note. Sections: How it works (3 steps), "Same list, two views" (explains no-spoilers), Secret Santa, final call to action, footer. All CTAs go to sign-up/log-in.

### Log in (`pages/login.html`)
Single taped sheet. Email + password on ruled lines, "Keep me logged in", gold Log in button, "Email me a login link", Google and Apple sign-in, link to create an account.

### Home (`pages/home.html`)
App header (logo, My lists / Secret Santa / Friends, gold "New list", account avatar). Greeting, then:
- **Your lists**: grid of mini paper sheets (title, wish count + date, first 3 items, sharing status) plus a dashed "Start a new list" tile.
- **Friends' lists**: rows with avatar, owner + list name, counts, "Open".
- **Sidebar**: Secret Santa sticky note for an active exchange ("You're buying for Sam", budget, swap date, link to that person's list), a new invitation card, "Organise a Secret Santa".

### List (`pages/list.html`) — interactive
Title, owner, date and count; a **My view / What friends see** toggle (the owner can preview the guest view).
- **Owner view**: items show shop-link and edit buttons; banner "Reserved and bought gifts are hidden from you"; an "add a wish" line accepting a pasted shop link or free text. No reservation state is ever shown.
- **Friend view**: banner "Maya can't see what you reserve or buy". Each item is one of:
  - `open` → "I'll get it" (outline)
  - `mine` (reserved by me) → gold tick, "you're getting this", **Mark as bought** (gold), Undo
  - `bought` (by me) → gold tick + strike, "bought by you", Undo
  - `taken` (by someone else) → gold tick + strike, "reserved"
- Gold star marks "most wanted" items.
- Sidebar: share link + Copy, avatars of people who've opened it, list settings (event date, visibility, most-wanted count).

### Secret Santa invite (`pages/invite.html`) — interactive
Invitation sheet: who invited you, exchange name, organiser's note (handwritten), budget / names-drawn date / swap date & place. Primary **Count me in**, secondary "I can't make it this year".
After joining: "You're in!" panel on a sticky note — choose which wish list your Santa will see (radio list incl. "Start a new list"), Done, Leave the exchange. Sidebar: "Who's playing" checklist (joined people ticked, pending ones faint) with "X of Y in", and a 3-step how-it-works.

---

## 8. Product rules the design depends on

1. **No spoilers**: the list owner never sees reserved/bought status — not in counts, notifications or emails — until they choose to reveal (e.g. after the event date).
2. A gift can be reserved by **one person only**; others see it as "reserved".
3. Reserving → marking bought are separate steps so people can claim early and buy later; both can be undone.
4. Guests should be able to view a shared list and reserve without friction (decide whether this needs an account or just a name/email).
5. Secret Santa draws never pair someone with themselves; organisers can add exclusion rules (e.g. couples, last year's pairs). Matches are private to each giver.
6. Each Secret Santa participant links one wish list that only their Santa sees.

---

## 9. Voice

Plain, warm, short. Sentence case. Buttons say exactly what happens ("I'll get it", "Mark as bought", "Count me in"). Handwritten Caveat notes can be playful ("you're getting this"); UI text stays clear.
