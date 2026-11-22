# Squash Elo Discord Bot

## What this project is
An Elo rating ladder for my squash friend group. It started as a Discord bot (log results with slash commands); since 2026-11-12 the **website is the main product**: OP.gg-style profiles, rating charts and match history, and next, accounts so people can register results on the web. The bot keeps working from the same services but gets no new features.
It is a learning and portfolio project: I must be able to explain every part in interviews. Hobby scale, so prefer the simplest design that works.

## How to work with me
- My workflow guide is `WORKFLOW.md` (spec → plan mode → small steps → verify → review → commit).
- `TODO.md` is the single checklist. Check items off there when they are done **and** verified, and add new tasks there.
- Claude writes the code. I write `elo.ts` (the rating logic) by hand.
- After each piece, explain what each function does and why. Don't quiz me or ask me to explain it back.
- Discuss real design tradeoffs before coding, with a recommendation. Explain new TypeScript ideas with Java comparisons.
- Before saying something is done: `npm run typecheck` and `npm test` must pass.
- I run all git commands myself. Suggest a branch name, commit message, and PR title/description.
- If unsure about a library API (discord.js changes often), say so and point to the docs.
- About me: MSc software engineering (HVL/UiB), strongest in Java, newer to TypeScript and async code, job hunting for backend/fullstack roles.

## Commands
- `npm run dev`: run the bot and the API together (reads `.env`)
- `npm run api`: run only the API, no Discord token needed (`DATABASE_PATH=seed.db npm run api` for fake data)
- `npm run dev:web`: API on `seed.db` + frontend together in one terminal (Ctrl+C stops both). The usual way to work on the website.
  Sets `DEV_LOGIN=1`: a dev-only "Log in as…" switcher in the header (never in production; `config.devLoginEnabled` has two locks)
- `npm run web`: run only the frontend dev server on http://localhost:5173 (needs the API running; `/api` is proxied to port 3000). Listens on all addresses (`host: true`) so the Windows browser can reach it from WSL
- In `web/`: `npm run typecheck`, `npm run lint` (oxlint), `npm run build`. Run these too after frontend changes
- `npm run deploy`: register slash commands with the test server (after adding/changing a command)
- `npm test`: unit tests (`node:test` via tsx, files `src/**/*.test.ts`)
- `npm run typecheck`: `tsc --noEmit` (tsx does not type-check)
- `npm run seed`: fresh `seed.db` with 6 fake players and 120 matches over 90 days (deterministic); the players also get web accounts
  (`seed1@example.com` … `seed6@example.com`, password `password`)
- Production: `npm run build` (backend `tsc -p tsconfig.build.json` → `dist/`, plus `web/dist`), `npm start` (bot + API + website from `dist/`),
  `npm run start:api` (website only, no Discord), `npm run backup` (snapshot into `BACKUP_DIR`, keeps 14), `npm run reset-link -- <email>` (one-time password link). Server: `deploy/deploy.sh`, setup in `deploy/SERVER_SETUP.md`
- `DATABASE_PATH=seed.db npm run dev`: run the bot on the fake data
- CI: `.github/workflows/ci.yml` runs the same checks on every PR and push to main (job "Typecheck, test, build"); keep it in sync
  when a check command changes. CD (auto-deploy) comes after the server exists

## Tech stack
- TypeScript on Node.js 24 LTS, ES modules, run with `tsx`
- discord.js v14 (slash commands, guild commands during development)
- SQLite via the built-in `node:sqlite` (`DatabaseSync`, synchronous)
- Config/secrets in `.env` (`DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, optional `DATABASE_PATH`, `PORT` (default 3000), `INVITE_CODE` (unset = website sign-up closed), `SITE_URL` (full reset links), `NODE_ENV=production` (Secure cookies), `WEB_DIST_PATH` (production: `web/dist`, Fastify serves the site), `BACKUP_DIR` (default `backups`)), never committed. Claude never reads `.env`
- Website: Fastify v5 API in the same process as the bot. Frontend in `web/` (own `package.json`): Vite 8, React 19, React Router 8 (declarative `<Routes>`), TanStack Query 5 (`useInfiniteQuery` for "Load more"), Tailwind 4, Recharts 3
- **Colours only through design tokens** (`web/src/index.css` `@theme`: canvas, surface, line, ink, muted, accent, win, loss, …), never Tailwind's
  palette classes (`slate-*`, `sky-*`, …) or hex values in components. Palette: matte neutral charcoal + squash-ball yellow `#e3c13b` (2026-11-20).
- Frontend style follows the Vite starter (single quotes, no semicolons). API response types are copied into `web/src/api.ts` (the backend imports node:sqlite, so it can't be imported in the browser); keep them in sync

## Project structure
```
src/
  index.ts              # starts the bot + API: openDatabase(databasePath), routes slash commands
  api.ts                # starts only the API (npm run api)
  config.ts             # databasePath, port, inviteCode, cookieSecure; discordConfig() checks the Discord vars (bot only)
  passwords.ts          # hashPassword/verifyPassword (scrypt), safeEqual, session tokens + hashToken (pure node:crypto)
  passwords.test.ts
  deploy-commands.ts    # registers slash commands with Discord
  api/                  # website API (thin like commands/: call a service, return JSON)
    server.ts           # buildServer(authOptions?): Fastify app + cookie plugin, not listening (tests use inject and pass their own invite code)
    routes.ts           # GET /api/health, /api/leaderboard, /api/players/:id, /api/players/:id/matches?limit&before&opponent&format, /api/h2h/:id/:opponentId, /api/matches?limit&before (activity feed) (Fastify schemas validate input)
    authRoutes.ts       # POST /api/signup, /api/login, /api/logout, /api/reset-password, /api/account/delete (requireLogin), GET /api/me; requireLogin hook + loggedInUser(request)
    reportRoutes.ts     # GET /api/opponents, GET/POST /api/reports (optional tournamentMatchId), POST /api/reports/:id/confirm|reject|cancel (all behind requireLogin)
    tournamentRoutes.ts # public GET /api/tournaments(/:id); behind requireLogin: POST /api/tournaments, POST/DELETE .../players, POST .../start, GET /api/me/tournament-matches (my open ones)
    devRoutes.ts        # dev only: GET /api/dev/users, POST /api/dev/login-as (registered only when config.devLogin; 404 otherwise)
    server.test.ts, hardening.test.ts (security headers, generic 500s), authRoutes.test.ts, reportRoutes.test.ts, tournamentRoutes.test.ts
  commands/             # one file per slash command (thin: input in, reply out)
    index.ts            # the list of all commands (add new ones here)
    ping.ts, result.ts, leaderboard.ts, undo.ts   # stats.ts, h2h.ts are empty placeholders
  services/             # business logic, shared by bot and later the API
    matchService.ts     # recordMatch, undoMatch, canUndo
    matchService.test.ts
    statsService.ts     # getLeaderboard, getPlayerProfile (incl. `opponents`: record vs each opponent), getPlayerMatches (cursor paging + opponent/format filters), getHeadToHead
    statsService.test.ts
    authService.ts      # signup (invite code), login, logout, getUserForSession, createPasswordReset/resetPassword (+ passwordReset.test.ts); `now` parameter for testable expiry
    accountService.ts   # deleteAccount: deletes the user, anonymises the player ("Deleted player", players.deleted_at) (+ accountService.test.ts)
    authService.test.ts
    reportService.ts    # reportResult, listReports, listOpponents, confirmReport (→ recordMatch), rejectReport, cancelReport
    reportService.test.ts
    tournamentService.ts  # create (draft) → add/remove players (organizer) → start (writes every slot) → details (standings or podium);
                          # syncKnockout: re-runs buildKnockout after a confirm (afterTournamentMatchResult) and after /undo (syncAllKnockouts)
    knockout.test.ts      # knockout through the service: seeding, byes, advancing, podium, 3rd place, undo, old-schema guard
    tournamentService.test.ts
  tournaments/          # pure tournament logic, no DB (like elo.ts)
    schedule.ts         # roundRobinSchedule: circle method, byes for odd counts (+ schedule.test.ts)
    standings.ts        # roundRobinStandings: wins | points, head-to-head mini-league tiebreak, shared places (+ standings.test.ts)
    bracket.ts          # knockout: bracketSize, seedOrder (doubling rule), buildKnockout(seeds, results), roundName (+ bracket.test.ts)
  db.test.ts            # reentrant transaction()
  backups.ts            # backupDatabase(dir): VACUUM INTO a dated file, keep the newest 14 (+ backups.test.ts)
  backup.ts             # entry for npm run backup
  resetLink.ts          # entry for npm run reset-link -- <email>: prints a one-time password reset link (SITE_URL + /reset?token=)
  services/healthService.ts  # checkHealth() for GET /api/health (server answers + DB readable)
deploy/                 # squash.service (systemd), squash-backup.service/.timer (04:00), Caddyfile (HTTPS), deploy.sh, SERVER_SETUP.md
  testHelpers.ts        # play(): record a bo5 match in one line, for tests
  db.ts                 # openDatabase + schema + all SQL. No business logic
  formats.ts            # MATCH_FORMATS (the one list: bo1 bo3 bo5 ft6 r11 r15 r21), rallyLength(); schemas and validation use it
  validation.ts         # isValidScore (pure) (+ validation.test.ts, every format)
  elo.ts                # pure Elo functions + replayMatches, no dependencies
  elo.test.ts
  seed.ts               # fake data script, refuses to write to squash.db
web/
  vite.config.ts        # React + Tailwind plugins, /api proxy to port 3000
  src/
    main.tsx            # QueryClientProvider + BrowserRouter around App
    App.tsx             # header + route table
    api.ts              # response types + fetch functions (getJson/postJson; ApiError carries the server's error text)
    auth.ts             # useCurrentUser (query ['me']), useLogin/useSignup/useLogout (mutations that update ['me'])
    format.ts           # display formatting: rounding, "+16", dates in Norwegian time
    formats.ts          # FORMATS: the website's copy of the format list, with labels ("15 rallies", "R15"); keep in sync with src/formats.ts
    reports.ts          # hooks for /results: useOpponents, useReports, create/confirm/reject/cancel mutations (also refresh tournaments)
    tournaments.ts      # hooks: useTournaments, useTournament(id), create/add/remove/start mutations, invalidateTournaments()
    scores.ts           # validResults(format): every valid result for the form (same rules as validation.ts)
    home.ts             # hooks for the front page: useRecentMatches (feed, infinite), useMyTournamentMatches
    pages/              # HomePage (/: dashboard + feed + leaderboard widget), LeaderboardPage (/leaderboard), AccountPage (/account: delete), PrivacyPage (/privacy), ResetPasswordPage (/reset?token=), PlayerPage (profile), LoginPage, SignupPage (?code= pre-fills the invite code), ResultsPage (/results, needs login),
                        # TournamentsPage (/tournaments: list + create form), TournamentPage (/tournaments/:id: draft view / standings + schedule)
    components/         # Panel (card), StatTile, ActivityFeed, LeaderboardWidget, Avatar, ResultBadge, RatingChart, MatchHistory, MatchFilters (?opponent&format in the URL), TextField, ReportForm, ReportList, StandingsTable, TournamentMatchRow (report/confirm on the match; TBD sides, seeds), BracketView (knockout columns)
```

## Layering (like Controller → Service → Repository in Java)
- `commands/` parse Discord input and format replies. No SQL, no Elo math.
- `services/` hold business logic and return plain data (not Discord text), so the website API can reuse them.
- `db.ts` holds SQL only. It doesn't import `elo.ts`; values like the starting rating are passed in.
- `elo.ts` is pure math with no imports, tested in isolation.

## Database design
- Tables: `players`, `matches`, `rating_history`, `users` (email unique, lowercase; `password_hash`; `player_id` unique → players), `sessions` (`token_hash` = SHA-256 of the cookie token, `user_id`, `expires_at`, 30 days fixed), `password_resets` (`token_hash`, 1 hour, single use; a new link replaces old ones), `match_reports` (web-reported results, scores from the reporter's view; `status` pending → confirmed | rejected | cancelled; `match_id` set on confirm, `ON DELETE SET NULL` if the match is undone; resolved rows are kept; optional `tournament_match_id`),
  `tournaments` (`type` round_robin | knockout, `match_format`, `ranking` wins | points, `status` draft | active; "finished" is computed),
  `tournament_players` (`seed` for knockout), `tournament_matches` (one row per slot: `round`, `position`, `player_a`/`player_b` nullable = knockout slot not decided yet; `match_id` set when confirmed, `ON DELETE SET NULL` so an undone match is unplayed again), `tournaments.third_place`.
- **Knockout bracket = a function of seeds + results** (like ratings = replay of matches): `buildKnockout` rebuilds every slot; `syncKnockout` writes the changed ones (and cancels a pending report on a slot whose players changed). Played slots never change.
- Web players get a UUID as player id (36 chars; Discord ids are numeric), so route schemas allow ids up to 64 chars.
- Players are identified by Discord user ID, stored as TEXT (64-bit, unsafe as a JS `number`).
- `players.display_name` and `players.avatar_url` are refreshed every time the player plays, so the website never calls Discord. `avatar_url` can be NULL (seed players).
- `players.rating` caches the current rating (simple leaderboard query) and is always updated in the same transaction as `rating_history`.
- `matches` stores raw data: `winner_id`, `loser_id`, both game scores, `format`, `reported_by`, `played_at`.
- `rating_history` has `match_id`, `player_id`, `rating_before`, `rating_after` (the difference gives "+16"). Rows cascade-delete with their match.
- Timestamps are UTC ISO strings. Convert to Norwegian time only when displaying.
- Multi-table writes go inside `transaction()` in `db.ts` (all or nothing). It's reentrant: a nested call joins the outer transaction (SQLite refuses a nested `BEGIN`), e.g. `confirmReport` → `recordMatch`.
- The DB is opened explicitly with `openDatabase(path)`. Tests use `":memory:"`, a fresh database per test.
- Migrations: `CREATE TABLE IF NOT EXISTS` never changes an existing table, so new columns are added with `addColumnIfMissing` in `initSchema`. Switch to numbered migrations if they pile up.

## Rating rules (decided)
FIDE-style Elo: each player has their own K-factor, so changes are not perfectly symmetric (a new player can gain more than a veteran loses). Accepted tradeoff, same as chess.
- Everyone starts at **1000**.
- Expected score: `E = 1 / (1 + 10 ^ ((ratingOpponent - ratingPlayer) / 400))`.
- Per-player K: **48** for a player's first 10 matches, **32** after.
- Format multiplier: Bo1 0.5, Bo3 0.75, Bo5 1.0, FT6 1.25, fixed rallies (R11/R15/R21) 0.5 (added 2026-11-19 by Claude, user-approved exception to "user writes elo.ts").
- Margin of victory: `marginFactor = 1 + 0.2 × (winnerGames − loserGames) / winnerGames` (3-0 → 1.20, 3-2 → 1.07, 7-5 → 1.06). Max +20%.
- Per player: `K = baseK × formatMultiplier × marginFactor`, `change = K × (result − E)`.
- No decay: ratings only change when you play.
- **Recorded vs rated** (decided 2026-11-20): a match is rated (moved ratings, has `rating_history`) exactly when `matches.rating_order` is set.
  - **Unranked** matches/tournaments (`ranked = 0`) are recorded and shown, never rated. The reporter chooses; the opponent sees it before confirming.
  - **Ranked tournament matches are rated when the tournament ends**, all at once, in the order they were played (`rateMatches`).
  - Replay = rated matches `ORDER BY rating_order` (not id). The K-factor's "first 10" counts rated matches only.
  - Leaderboard W–L counts rated matches only; profile W–L/form/streak include unranked and pending ones (labelled).
- Ratings stored as REAL, rounded only for display. All numbers are starting values, tune after real use.

## Design decisions
- **Match formats:** Best of 1, Best of 3, Best of 5, First to 6 (win by 2: 6-0…6-4, then 7-5, 8-6, …), and fixed rallies 11/15/21
  (exactly N points are played, the score is in points, e.g. 8–7; stored in the same `winner_games`/`loser_games` columns). Rally formats are
  website-only (not in the Discord `/result` choices). Adding a format: `src/formats.ts`, `web/src/formats.ts`, `elo.ts` multiplier, `validation.ts`. `/result` takes `opponent`, `format` (choices), `my_games`, `their_games` (from the reporter's view). Score rules live in `validation.ts`.
- **`/undo`:** only the most recent match, after a confirmation button. It deletes the match, then **recomputes all ratings from scratch** with `replayMatches` (everyone back to 1000, replay every remaining match ordered by `id`, rewrite `rating_history` and `players.rating`). The same replay works for rule changes and future seasons. Anyone can undo for now (`canUndo`).
- Replay order is `matches.rating_order` (the order matches were rated; existing matches got `rating_order = id`), not `played_at` (could tie).
  For web reports that's confirmation order; for a ranked tournament, the moment it finished. Undo un-rates the matches of tournaments
  that are no longer finished (`unrateUnfinishedTournaments`) before the full replay.
- **Web result reporting (W3):** only against players with a web account (they must confirm). Only the opponent confirms/rejects, only the reporter cancels, only while pending. Reports you're not part of give 404. Protected routes use the `requireLogin` onRequest hook, so a logged-out request gets 401 before body validation.
- `recordMatch` accepts an optional `playedAt` (defaults to now). Used by the seed script, and later by an optional date on `/result`.
- Website: API in the same process as the bot (one deploy). SQLite WAL mode so reads don't block writes. Tradeoff: if the bot crashes, the site goes down too. Acceptable here.
- **Web accounts (W1 done, rest in TODO.md section 4):** email + password (scrypt from `node:crypto`), session token in an httpOnly cookie, invite code required to sign up. A `users` row links to a `players` row, so Discord players and web players share all stats code. Web-reported results wait in `match_reports` until the opponent confirms; confirming calls `recordMatch`, so the rating logic is unchanged.
- No rank tiers (decided 2026-11-12): the rating number is the only measure shown. Seasons = replay only the matches in a date range, no schema change needed.

## Rules for the code
- Never hardcode the bot token. Read it through `config.ts`, which is the only file that reads `process.env` (`seed.ts` aside).
- Validate all user input before touching the database.
- Keep Elo logic in `elo.ts` as pure functions with tests.
- Small commits, one feature at a time.

## Current status
- Bot works: `/ping`, `/result`, `/leaderboard`, `/undo` (with replay). 269 tests pass.
- Accounts API works (W1): sign-up with invite code, login, logout, `/api/me`, httpOnly session cookie.
- Avatars are stored and `seed.db` provides fake data for the website.
- API works: leaderboard, player profile, match history (cursor paging), head-to-head. WAL mode on.
- Front page (D1 step 2): your dashboard (rating + `ratingChangeWeek`, results waiting, open tournament matches), activity feed, compact leaderboard.
- Frontend works: leaderboard page and player profile (stats, form, rating chart, paged match history with opponent/format filters).
- Round-robin tournaments backend works (T1a): create, players, start (circle-method schedule), matches via report → confirm (count for Elo),
  standings by wins or points with head-to-head tiebreak. Tournament rules: 3–16 players with web accounts; only the organizer changes it; only while draft.
- Round-robin tournament pages work (T2): create, players, start, standings + schedule, report/confirm on the match, 🏆 labels.
  API extras for the pages: tournament matches expose `pendingReport`, reports carry `tournamentName`, profile matches carry `tournament`.
- Knockout tournaments work (T1b): seeded by rating, byes, optional 3rd place, bracket view, podium; Discord /undo re-syncs the bracket.
- Rating rules work: unranked matches/tournaments; ranked tournaments count when they end (`ratingRules.test.ts`).
- Next feature work: TODO.md section 5: D1 design pass (user has input), then hosting (W5b) and invite friends. Plan in plan mode.
- Login pages work (W2): sign-up (invite link `/signup?code=...`), login, logout, name in the header.
- Report results API works (W3): report, confirm/reject/cancel, ratings change only on confirm.
- Results page works (W4): register a result, confirm/reject/cancel, "Results (n)" badge. The site works end to end locally.
- Launch prep (2026-11-22): security headers + generic 500s (`server.ts`), privacy page, delete account (anonymise:
  matches stay so nobody else's rating changes), admin-made reset links (`npm run reset-link`). No email sending.
- Production setup ready (W5a): build, Fastify serves the site, health check, login/sign-up rate limit (10 per 15 min per IP, separate per route), backups, deploy files.
- **Production layout (Hetzner, Ubuntu 24.04):** user `squash`, code in `/home/squash/SquashBot`, data + backups in `/home/squash/data`,
  systemd `squash.service` (only `/home/squash/data` writable), Caddy on 443 → `127.0.0.1:3000` (`trustProxy: true`).
- Next: W5b, the user sets up the server with `deploy/SERVER_SETUP.md`. Then README. Remaining bot commands `/stats` and `/h2h` come after, as thin wrappers around the services the website builds.
