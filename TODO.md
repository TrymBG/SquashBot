# TODO

The single checklist for the project. Work top to bottom.
Claude checks an item off only when it is done **and** verified (`npm test` and `npm run typecheck` pass).
New tasks found along the way go in the right section, not in chat.

**Order:** sections 1–3 are the Discord-first phase (mostly done). Since 2026-11-12 the website is the main product:
section 4 (accounts, registering results on the web) is next, then hosting.

---

## 1. Now: `/undo` recomputes all ratings
- [x] `replayMatches` + tests in `elo.ts`
- [x] `db.ts`: `getAllMatchesForReplay`, `deleteAllRatingHistory`, `resetAllRatings`
- [x] Make the database path configurable, so tests can use an in-memory database (`":memory:"`)
- [x] `matchService.test.ts`, tests first:
  - [x] undo when the match is no longer the latest → refused
  - [x] undo the only match in the database → everyone back to 1000, history empty
  - [x] a player whose only match is undone → back to 1000
  - [x] undo after several matches → same ratings as if the match was never logged
- [x] Rewrite `undoMatch` with the replay, and delete `getRatingsBefore`
- [x] Commit (`501dbe7`, together with step 2)

## 2. Next: prepare data for the website
- [x] Store the Discord avatar URL in `players`, refreshed like `display_name` (with a migration for existing databases)
- [x] Seed script: 120 fake matches between 6 players over 90 days through `recordMatch`, into `seed.db` (never `squash.db`)
- [x] Commit (`501dbe7`)

## 3. Website (OP.gg-style)
- [x] Plan stack and pages in plan mode (Fastify API in the bot process, React + Vite, WAL mode)

Milestones, one branch + PR each, each planned in plan mode when it starts:
0. Cleanup + tooling → 1. API skeleton (`/api/leaderboard`) → 2. stats services + API → 3. frontend skeleton
→ 4. profile page → 5. H2H + match history pages → 6. `/stats` + `/h2h` → 7. hosting + README.
Decided: frontend in `web/` (own `package.json`, Vite proxies `/api` in dev, Fastify serves `web/dist` in prod);
`npm run api` runs the API without Discord (config split: `discordConfig()` only checked by the bot).

- [x] API skeleton: `buildServer()` + `GET /api/leaderboard`, tested with `inject`, `npm run api`, WAL, config split, `tsconfig` `include: ["src"]`
- [x] Read-only API reusing `services/`: `/api/players/:id`, `/api/players/:id/matches?limit&before`, `/api/h2h/:id/:opponentId` (Fastify schemas, 404/400)
- [x] `statsService`: `getPlayerProfile` (record, form, streak, peak, position, chart points), `getPlayerMatches` (cursor paging), `getHeadToHead` (with tests)
- [x] Frontend skeleton in `web/`: Vite + React + TS, Tailwind, TanStack Query, React Router, `/api` proxy
- [x] Leaderboard page (avatars, rating, W–L, win %, links to `/players/:id` placeholder)
- [x] Dev quick wins: `host: true` in `vite.config.ts` (Windows browser reaches WSL), `npm run dev:web` (API on `seed.db` + website, via `concurrently`)
- [x] Player profile: avatar, rating, position, W–L, win %, streak, peak, recent form (W W L W)
- [x] Rating-over-time chart (Recharts, x-axis = match number, date in tooltip)
- [x] Match history on the profile: rating change per match, "Load more" with the `before` cursor
- [ ] Head-to-head page and "rivals" (most played opponents)
- [ ] All-matches page (everyone's recent matches, not just one player's). Needs a new API endpoint
- [ ] Design pass: own visual identity instead of the generic look (user has input, discuss first)
- [ ] Deploy

## 4. Web-first: accounts and registering results on the website
Decided 2026-11-12: the website becomes the main product. The Discord bot keeps working from the same services,
but gets no new features. Each milestone gets its own plan-mode session and branch.

Design:
- Login with email + password. Passwords hashed with `node:crypto` scrypt (salt, `timingSafeEqual`), no extra dependency.
- Sessions: random token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production); `sessions` table stores a hash of the token.
- Invite code required to sign up (one shared code in `.env` at first, read via `config.ts`).
- A web account links to a player: `users` (email, password_hash, player_id). Discord players keep their Discord ID; web players get a generated id.
- Results need the opponent's confirmation: pending reports live in a `match_reports` table; confirming calls the existing `recordMatch`,
  so ratings, history, undo and replay don't change. Rejected reports never touch ratings.

Milestones:
- [ ] W1 Accounts API: `users` + `sessions` tables, `POST /api/signup` (invite code), `POST /api/login`, `POST /api/logout`, `GET /api/me`, tests
- [ ] W2 Frontend auth: sign-up and login pages, header shows who's logged in, logout
- [ ] W3 Report results API: `POST /api/reports` (validated with `isValidScore`), list my pending, confirm (→ `recordMatch`) / reject, only the opponent can confirm, tests
- [ ] W4 Frontend: "register result" form, "waiting for your confirmation" list
- [ ] W5 Hosting (HTTPS is needed for `Secure` cookies), see "Hosting + README"
- [ ] Later: rate-limit login (`@fastify/rate-limit`), "forgot password" (needs email sending), claim an existing Discord player for a web account, admin tools, tournaments

## Project setup
- [x] Split `CLAUDE.md`: project context (stack, DB design, rating rules, decisions, status) back in `CLAUDE.md`, personal workflow guide in `WORKFLOW.md`
- [x] Decide what goes in git: `CLAUDE.md`, `WORKFLOW.md`, `TODO.md` all committed (`claude.md` removed from `.gitignore`)
- [x] Delete the old `ROADMAP.md` (replaced by this file)
- [x] PR workflow: install `gh` (`sudo apt install gh`, `gh auth login`), one branch per feature, "Squash and merge"
- [ ] Hook: run `npm run typecheck` after every file edit
- [x] Permission allowlist in `.claude/settings.json` (`npm test`, `npm run typecheck`, `git status/diff/log`)

## Bot: fixes and cleanup
- [x] `index.ts` error handler: use `followUp` when the interaction was already replied to (today a second `reply` throws)
- [x] `validation.ts`: header comment still mentions parsing "3-1" strings
- [x] `config.ts`: stray blank lines and whitespace

## Bot: remaining commands (on hold: web-first since 2026-11-12, the bot gets no new features)
- [ ] `/stats [player]`: rating, W–L, win %, recent matches with rating change (+16), zero-match case
- [ ] `/h2h player1 player2`: record between two players, last 5 matches
- [ ] All user input validated

## Hosting + README
- [ ] Pick a host that keeps the SQLite file on a persistent disk (Raspberry Pi, small VPS, Fly.io with a volume, …)
- [ ] Run it with a process manager so it restarts on crash
- [ ] API listens on `127.0.0.1` (Fastify default). On a host, listen on `0.0.0.0` (add a `HOST` option in `config.ts`)
- [ ] `npm audit`: 1 high in `undici`, pulled in by `discord.js`. Check if a newer `discord.js` fixes it
- [ ] Back up the database file (a simple copy job counts)
- [ ] README: what it does, screenshots, how to run it, design decisions and tradeoffs
- [ ] Friends are using it while my laptop is off

## Later / ideas
- [ ] Frontend bundle is >500 kB (mostly Recharts): lazy-load the profile page with `React.lazy` if load time becomes noticeable
- [ ] Seasons: replay only the matches within a date range
- [ ] Optional date on `/result` ("we played yesterday"). The service already accepts `playedAt`, only the command option is missing
- [ ] Autocomplete that suggests only valid scores for the chosen format
- [ ] Restrict `canUndo` (for example to the two players)
- [ ] "Last played" on the leaderboard
