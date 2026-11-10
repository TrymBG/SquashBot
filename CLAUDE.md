# Squash Elo Discord Bot

## What this project is
A Discord bot for my squash friend group. We log match results with slash commands, and the bot keeps an Elo rating ladder, leaderboard, and head-to-head stats. Next: an OP.gg-style read-only website (profiles, rating charts, match history).
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
- `npm run deploy`: register slash commands with the test server (after adding/changing a command)
- `npm test`: unit tests (`node:test` via tsx, files `src/**/*.test.ts`)
- `npm run typecheck`: `tsc --noEmit` (tsx does not type-check)
- `npm run seed`: fresh `seed.db` with 6 fake players and 120 matches over 90 days (deterministic)
- `DATABASE_PATH=seed.db npm run dev`: run the bot on the fake data

## Tech stack
- TypeScript on Node.js 24 LTS, ES modules, run with `tsx`
- discord.js v14 (slash commands, guild commands during development)
- SQLite via the built-in `node:sqlite` (`DatabaseSync`, synchronous)
- Config/secrets in `.env` (`DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, optional `DATABASE_PATH`, `PORT` (default 3000)), never committed
- Website: Fastify v5 API in the same process as the bot (done: `/api/leaderboard`). Planned: React + Vite frontend in `web/`, Recharts for charts

## Project structure
```
src/
  index.ts              # starts the bot + API: openDatabase(databasePath), routes slash commands
  api.ts                # starts only the API (npm run api)
  config.ts             # databasePath, port; discordConfig() checks the Discord vars (bot only)
  deploy-commands.ts    # registers slash commands with Discord
  api/                  # website API (thin like commands/: call a service, return JSON)
    server.ts           # buildServer(): Fastify app, not listening (tests use inject)
    routes.ts           # GET /api/...
    server.test.ts
  commands/             # one file per slash command (thin: input in, reply out)
    index.ts            # the list of all commands (add new ones here)
    ping.ts, result.ts, leaderboard.ts, undo.ts   # stats.ts, h2h.ts are empty placeholders
  services/             # business logic, shared by bot and later the API
    matchService.ts     # recordMatch, undoMatch, canUndo
    matchService.test.ts
    statsService.ts     # getLeaderboard (getPlayerStats, getHeadToHead planned)
  db.ts                 # openDatabase + schema + all SQL. No business logic
  validation.ts         # isValidScore (pure)
  elo.ts                # pure Elo functions + replayMatches, no dependencies
  elo.test.ts
  seed.ts               # fake data script, refuses to write to squash.db
```

## Layering (like Controller → Service → Repository in Java)
- `commands/` parse Discord input and format replies. No SQL, no Elo math.
- `services/` hold business logic and return plain data (not Discord text), so the website API can reuse them.
- `db.ts` holds SQL only. It doesn't import `elo.ts`; values like the starting rating are passed in.
- `elo.ts` is pure math with no imports, tested in isolation.

## Database design
- Tables: `players`, `matches`, `rating_history`.
- Players are identified by Discord user ID, stored as TEXT (64-bit, unsafe as a JS `number`).
- `players.display_name` and `players.avatar_url` are refreshed every time the player plays, so the website never calls Discord. `avatar_url` can be NULL (seed players).
- `players.rating` caches the current rating (simple leaderboard query) and is always updated in the same transaction as `rating_history`.
- `matches` stores raw data: `winner_id`, `loser_id`, both game scores, `format`, `reported_by`, `played_at`.
- `rating_history` has `match_id`, `player_id`, `rating_before`, `rating_after` (the difference gives "+16"). Rows cascade-delete with their match.
- Timestamps are UTC ISO strings. Convert to Norwegian time only when displaying.
- Multi-table writes go inside `transaction()` in `db.ts` (all or nothing).
- The DB is opened explicitly with `openDatabase(path)`. Tests use `":memory:"`, a fresh database per test.
- Migrations: `CREATE TABLE IF NOT EXISTS` never changes an existing table, so new columns are added with `addColumnIfMissing` in `initSchema`. Switch to numbered migrations if they pile up.

## Rating rules (decided)
FIDE-style Elo: each player has their own K-factor, so changes are not perfectly symmetric (a new player can gain more than a veteran loses). Accepted tradeoff, same as chess.
- Everyone starts at **1000**.
- Expected score: `E = 1 / (1 + 10 ^ ((ratingOpponent - ratingPlayer) / 400))`.
- Per-player K: **48** for a player's first 10 matches, **32** after.
- Format multiplier: Bo1 0.5, Bo3 0.75, Bo5 1.0, FT6 1.25.
- Margin of victory: `marginFactor = 1 + 0.2 × (winnerGames − loserGames) / winnerGames` (3-0 → 1.20, 3-2 → 1.07, 7-5 → 1.06). Max +20%.
- Per player: `K = baseK × formatMultiplier × marginFactor`, `change = K × (result − E)`.
- No decay: ratings only change when you play.
- Ratings stored as REAL, rounded only for display. All numbers are starting values, tune after real use.

## Design decisions
- **Match formats:** Best of 1, Best of 3, Best of 5, First to 6 (win by 2: 6-0…6-4, then 7-5, 8-6, …). `/result` takes `opponent`, `format` (choices), `my_games`, `their_games` (from the reporter's view). Score rules live in `validation.ts`.
- **`/undo`:** only the most recent match, after a confirmation button. It deletes the match, then **recomputes all ratings from scratch** with `replayMatches` (everyone back to 1000, replay every remaining match ordered by `id`, rewrite `rating_history` and `players.rating`). The same replay works for rule changes and future seasons. Anyone can undo for now (`canUndo`).
- Replay order is `matches.id` (insertion order, unique), not `played_at` (could tie).
- `recordMatch` accepts an optional `playedAt` (defaults to now). Used by the seed script, and later by an optional date on `/result`.
- Website: API in the same process as the bot (one deploy), read-only, no login. Enable SQLite WAL mode so reads don't block writes. Tradeoff: if the bot crashes, the site goes down too. Acceptable here.
- Rank tiers (Gold, Plat, …) are display-only, computed from rating. Seasons = replay only the matches in a date range. Neither needs a schema change.

## Rules for the code
- Never hardcode the bot token. Read it through `config.ts`, which is the only file that reads `process.env` (`seed.ts` aside).
- Validate all user input before touching the database.
- Keep Elo logic in `elo.ts` as pure functions with tests.
- Small commits, one feature at a time.

## Current status
- Bot works: `/ping`, `/result`, `/leaderboard`, `/undo` (with replay). 28 tests pass.
- Avatars are stored and `seed.db` provides fake data for the website.
- API skeleton works: `GET /api/leaderboard`, WAL mode on.
- Next: website milestone 2 (stats services + API), see TODO.md section 3. Remaining bot commands `/stats` and `/h2h` come after, as thin wrappers around the services the website builds.
