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
- [x] W1 Accounts API: `users` + `sessions` tables, `POST /api/signup` (invite code), `POST /api/login`, `POST /api/logout`, `GET /api/me`, tests
  - Set `INVITE_CODE=...` in `.env` to open sign-up (unset = closed). Protect W3 routes with `currentUser(request)` from `api/authRoutes.ts`
- [x] W2 Frontend auth: sign-up and login pages, header shows who's logged in, logout
  - Invite link for friends: `/signup?code=<INVITE_CODE>` pre-fills the code
- [x] W3 Report results API: `POST /api/reports` (validated with `isValidScore`), list my pending, confirm (→ `recordMatch`) / reject, only the opponent can confirm, tests
  - Also: reporter can cancel, `GET /api/opponents`, optional `playedAt` (≤ 30 days back), reentrant `transaction()`, `requireLogin` hook (401 before validation)
- [x] W4 Frontend: "register result" form, "waiting for your confirmation" list
  - `/results` page; score picked from valid results only (`web/src/scores.ts`); "Results (n)" badge in the header.
    Friends can now use the site end to end on localhost. Next: W5 hosting, so they can use it for real
- [ ] W5 Hosting on a Hetzner VPS (HTTPS is needed for `Secure` cookies), see "Hosting + README"
  - [x] W5a code: `npm run build`/`start`/`backup`, Fastify serves `web/dist`, `/api/health`, login + sign-up rate limit, `deploy/` files + `SERVER_SETUP.md`
  - [ ] W5b server: follow `deploy/SERVER_SETUP.md` (user runs it)
- [ ] Later: "forgot password" (needs email sending), claim an existing Discord player for a web account, admin tools, tournaments

## 5. Before inviting friends: features + design (decided 2026-11-19)
Additions only (new tables, no changes to existing ones), so they don't block hosting. Order: filters → tournaments → design pass → invite.
Each milestone planned in plan mode.
- [x] F1 Match history filters on the profile: by opponent and format, kept in the URL; "vs Ola: 7–5" line; profile has `opponents`
  - Left for later if wanted: date-range filter
- [ ] T1 Tournaments, backend: `tournaments` (with `format`: knockout | round_robin), `tournament_players`, `tournament_matches` tables
      (shared by both formats); create/add players/start API; reports get an optional tournament match link, confirming records the
      match (counts for Elo via `recordMatch`) and updates the tournament
  - Knockout: bracket logic as a pure function with tests (seeding, byes for non-power-of-2, who meets whom next); winner moves on
  - Round robin: schedule as a pure function (circle method, everyone meets everyone **once**); matches can be played in any order.
    Organizer picks the ranking when creating (decided 2026-11-19):
    - **Match wins**: wins, then head-to-head, then game difference
    - **Total points**: sum of points scored (loser keeps theirs: 8–7 gives 8 and 7), then head-to-head, then match wins
  - [x] PR 1: fixed-rally formats r11/r15/r21 (score in points, sum = N), Elo multiplier 0.5, usable everywhere on the website;
    one format list per side (`src/formats.ts`, `web/src/formats.ts`); `validation.test.ts` covers every format
  - [x] PR 2: round-robin backend: tables, `roundRobinSchedule`, `roundRobinStandings` (wins or points), service, routes, tournament reports
  - [x] T1b: knockout (4–16 players, seeded by rating, byes for top seeds, optional 3rd-place match, bracket view, podium).
    Schema changed (nullable slots, `position`, `seed`, `third_place`): run `npm run seed` once on any old local seed.db
  - Decided: two separate formats, picked when creating; 4–16 players; any logged-in user can create one (creator = organizer);
    tournament matches count for Elo
  - Candidates for writing by hand (like `elo.ts`): the bracket function, the round-robin schedule and the standings/tiebreak function
  - Maybe split: T1a shared tables + knockout, T1b round robin (decide in plan mode)
- [x] T2 Tournaments, frontend (round robin): `/tournaments` (list + create form), `/tournaments/:id` (draft: players + start;
      active: standings + schedule by round, report/confirm/reject/cancel right on the match); 🏆 label in /results and on profiles
  - [x] Knockout bracket view (columns per round, sideways scroll on phones)
- [ ] Later: groups → knockout (round-robin groups, top players into a bracket), double round robin
- [x] Dev "Log in as…" (DEV_LOGIN=1, never in production) + seed players with web accounts, for testing tournaments
- [x] Tournament matches count for Elo only when the tournament ends (decided 2026-11-20)
- [x] Unranked matches and tournaments: in history, never change ratings; leaderboard W–L counts rated matches only
- [ ] Organizer can end a tournament early (until then, an unfinished ranked tournament's matches never count)
- [ ] D1 Design pass (user has input, discuss first)
  - [x] Step 1: design tokens in `index.css` + matte charcoal palette, squash-ball yellow accent
  - [ ] Next steps (decide together): fonts/type scale, spacing/density, header and leaderboard layout, logo
- [ ] Invite friends (after W5b hosting)

## Project setup
- [x] Split `CLAUDE.md`: project context (stack, DB design, rating rules, decisions, status) back in `CLAUDE.md`, personal workflow guide in `WORKFLOW.md`
- [x] Decide what goes in git: `CLAUDE.md`, `WORKFLOW.md`, `TODO.md` all committed (`claude.md` removed from `.gitignore`)
- [x] Delete the old `ROADMAP.md` (replaced by this file)
- [x] PR workflow: install `gh` (`sudo apt install gh`, `gh auth login`), one branch per feature, "Squash and merge"
- [ ] Hook: run `npm run typecheck` after every file edit
- [x] CI: GitHub Actions (`.github/workflows/ci.yml`) on PRs and main: typecheck, tests, web typecheck/lint, build
- [x] Branch rule on main: CI check "Typecheck, test, build" required before merging (admin can still bypass)
- [ ] CD: deploy on merge to main (Action SSHes into the server and runs `deploy/deploy.sh`), after W5b
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
- [x] Pick a host that keeps the SQLite file on a persistent disk: Hetzner VPS (decided 2026-11-18)
- [x] Run it with a process manager so it restarts on crash: systemd (`deploy/squash.service`, `Restart=always`)
- [x] ~~Listen on `0.0.0.0`~~ Not needed: the app stays on `127.0.0.1:3000`, only Caddy is public and proxies to it
- [x] `npm audit`: `npm audit fix` updated `undici` 6.29.0 → 6.29.1, 0 vulnerabilities
- [x] Back up the database file: `npm run backup` (`VACUUM INTO`, keeps 14), nightly via `deploy/squash-backup.timer`
- [ ] Buy a domain (until then `<ip-with-dashes>.sslip.io`)
- [ ] Off-server backup copy (Hetzner Backups, or download one now and then)
- [ ] README: what it does, screenshots, how to run it, design decisions and tradeoffs
- [ ] Friends are using it while my laptop is off

## Later / ideas
- [ ] Expire old pending reports (e.g. auto-reject after 7 days) if they pile up
- [ ] Discord `/undo` can undo a match confirmed on the website: decide if web users should get their own undo (or lose Discord undo)
- [ ] Frontend tests: Vitest + Testing Library for the forms (renders, shows server error, disables while sending)
- [ ] Frontend bundle is >500 kB (mostly Recharts): lazy-load the profile page with `React.lazy` if load time becomes noticeable
- [ ] Seasons: replay only the matches within a date range
- [ ] Optional date on `/result` ("we played yesterday"). The service already accepts `playedAt`, only the command option is missing
- [ ] Autocomplete that suggests only valid scores for the chosen format
- [ ] Restrict `canUndo` (for example to the two players)
- [ ] "Last played" on the leaderboard
