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

## Test

```sh
bun run test         # unit + database tests (needs `bun run db:up`)
bun run test:unit    # pure logic only, no database
bun run test:db      # server code, routes and form actions against MariaDB
bun run test:e2e     # browser tests (Playwright); first time: bunx playwright install chromium
```

- **Unit** tests (`src/**/*.test.ts`) cover parsing, formatting, URL safety, email rendering and hooks.
- **Database** tests (`*.db.test.ts`, in `src/lib/server/` and `tests/routes/`) call loads, form actions and
  endpoints directly. They run against a separate `<DB_NAME>_test` database, created and migrated
  automatically (using `DB_ROOT_PASSWORD`). Rows are uniquely named, so the database is kept between
  runs; set `TEST_DB_RESET=1` to rebuild it. Helpers live in `tests/helpers/`.
- **Browser** tests (`tests/e2e/`) start a dev server on :5183 against the test database and read
  sign-in codes from Mailpit.

## Database

Edit `src/lib/server/db/app.schema.ts`, then `bun run db:generate` and `bun run db:migrate`.
Production applies `drizzle/` migrations on boot (`scripts/migrate.js`).

## Deploy

Coolify, built from the `Dockerfile`. Target domain: wishlist.devotion.software (TBC).
Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM` and the `R2_*` vars.

The app is stateless, so you can run as many instances as you like behind a load balancer:
sessions, OTPs, passkey challenges and rate limits all live in MariaDB, and images in R2
(production won't start without R2 unless `ALLOW_LOCAL_UPLOADS=true`). Every instance runs
migrations on start; a database lock makes them take turns. Point health checks at `/healthz`,
and size `DB_POOL_SIZE` so instances × pool stays under MariaDB's `max_connections`.

### Reminder emails

Every instance runs `src/lib/server/reminders.ts` hourly (a MariaDB lock lets one do the work, and
`reminder_sent` makes each email go out once):

- people who can see a list get a nudge 14 and 3 days before its date, if they haven't claimed anything;
- anyone who said "I'll get it" two weeks ago and hasn't marked it bought gets one reminder;
- Secret Santa givers get a reminder a week before the swap.

Owners never get emails about their own lists. Each email has an unsubscribe link, and people pick
which reminders they want on their account page. Set `REMINDERS=off` to stop them, or `REMINDERS=on`
to try them in dev (`REMINDER_INTERVAL_MINUTES` changes how often it checks).
