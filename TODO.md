# TODO

The single checklist for the project. Work top to bottom.
Claude checks an item off only when it is done **and** verified (`npm test` and `npm run typecheck` pass).
New tasks found along the way go in the right section, not in chat.

**Order:** finish `/undo` → avatar + seed data → website. `/stats` and `/h2h` come almost for free afterwards,
because the website builds the same service functions (`getPlayerStats`, `getHeadToHead`).

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
- [ ] Read-only API reusing `services/`: leaderboard, players, matches
- [ ] `statsService`: `getPlayerStats`, `getHeadToHead` (with tests)
- [ ] Leaderboard page
- [ ] Player profile: avatar, rating, tier, W–L, win %, recent form (W W L W)
- [ ] Rating-over-time chart (Recharts)
- [ ] Head-to-head page and "rivals" (most played opponents)
- [ ] Match history page with rating change per match
- [ ] Deploy

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

## Bot: remaining commands (thin wrappers once the services exist)
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
- [ ] Rank tiers from rating (Bronze, Silver, Gold, …), display only
- [ ] Seasons: replay only the matches within a date range
- [ ] Optional date on `/result` ("we played yesterday"). The service already accepts `playedAt`, only the command option is missing
- [ ] Autocomplete that suggests only valid scores for the chosen format
- [ ] Restrict `canUndo` (for example to the two players)
- [ ] "Last played" on the leaderboard
