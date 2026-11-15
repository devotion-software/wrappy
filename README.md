# Wishlist

Wish lists you can share without spoiling the surprise, plus Secret Santa.

SvelteKit (Svelte 5) · Bun · MariaDB + Drizzle · Better Auth (email codes + passkeys).
UI follows the "Notebook" design in `design/` — see `design/DESIGN.md`.

## Develop

```sh
cp .env.example .env
bun install          # also points git at .githooks (version bump prompt on main)
bun run db:up        # MariaDB on :3313, Mailpit on :8028
bun run db:migrate
bun run dev          # http://localhost:5182
```

Sign-in codes land in Mailpit at http://localhost:8028.

## Database

Edit `src/lib/server/db/app.schema.ts`, then `bun run db:generate` and `bun run db:migrate`.
Production applies `drizzle/` migrations on boot (`scripts/migrate.js`).

## Deploy

Coolify, built from the `Dockerfile`. Target domain: wishlist.devotion.software (TBC).
Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM` and the `R2_*` vars.
