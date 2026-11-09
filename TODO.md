# TODO

The single checklist for the project. Work top to bottom.
Claude checks an item off only when it is done **and** verified (`npm test` and `npm run typecheck` pass).
New tasks found along the way go in the right section, not in chat.

---

## Now: `/undo` recomputes all ratings
- [x] `replayMatches` + tests in `elo.ts`
- [x] `db.ts`: `getAllMatchesForReplay`, `deleteAllRatingHistory`, `resetAllRatings`
- [ ] Make the database path configurable, so tests can use an in-memory database (`":memory:"`)
- [ ] `matchService.test.ts`, tests first:
  - [ ] undo when the match is no longer the latest → refused
  - [ ] undo the only match in the database → everyone back to 1000, history empty
  - [ ] a player whose only match is undone → back to 1000
  - [ ] undo after several matches → same ratings as if the match was never logged
- [ ] Rewrite `undoMatch` with the replay, and delete `getRatingsBefore`
- [ ] Commit: "Recompute all ratings on undo instead of restoring rating_before"

## Project setup
- [ ] Split `CLAUDE.md`: project context (stack, DB design, rating rules, decisions, status) back in `CLAUDE.md`, personal workflow guide in `WORKFLOW.md`
- [ ] Remove `claude.md` and `ROADMAP.md` from `.gitignore`, commit `CLAUDE.md`, `WORKFLOW.md`, `TODO.md`
- [ ] Delete the old `ROADMAP.md` (replaced by this file)
- [ ] Hook: run `npm run typecheck` after every file edit
- [ ] Permission allowlist in `.claude/settings.json` (`npm test`, `npm run typecheck`, `git status/diff/log`)

## Bot: fixes and cleanup
- [ ] `index.ts` error handler: use `followUp` when the interaction was already replied to (today a second `reply` throws)
- [ ] `validation.ts`: header comment still mentions parsing "3-1" strings
- [ ] `config.ts`: stray blank lines and whitespace

## Bot: step 4 features
- [ ] Store the Discord avatar URL in `players`, refreshed like `display_name` (needed for the website)
- [ ] `/stats [player]`: rating, W–L, win %, recent matches with rating change (+16), zero-match case
- [ ] `/h2h player1 player2`: record between two players, last 5 matches
- [ ] All user input validated

## Step 5: hosting + README
- [ ] Pick a host that keeps the SQLite file on a persistent disk (Raspberry Pi, small VPS, Fly.io with a volume, …)
- [ ] Run it with a process manager so it restarts on crash
- [ ] Back up the database file (a simple copy job counts)
- [ ] README: what it does, screenshots, how to run it, design decisions and tradeoffs
- [ ] Friends are using it while my laptop is off

## Phase 2: website (OP.gg-style, only after friends use the bot)
- [ ] Read-only Fastify API in the same process as the bot, reusing `services/` (enable SQLite WAL mode)
- [ ] Leaderboard page
- [ ] Player profile: avatar, rating, tier, W–L, win %, recent form (W W L W)
- [ ] Rating-over-time chart (Recharts)
- [ ] Head-to-head page and "rivals" (most played opponents)
- [ ] Match history page with rating change per match
- [ ] Deploy

## Later / ideas
- [ ] Rank tiers from rating (Bronze, Silver, Gold, …), display only
- [ ] Seasons: replay only the matches within a date range
- [ ] Optional date on `/result` ("we played yesterday")
- [ ] Autocomplete that suggests only valid scores for the chosen format
- [ ] Restrict `canUndo` (for example to the two players)
- [ ] "Last played" on the leaderboard
