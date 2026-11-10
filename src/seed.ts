// Separate script: fills a database with fake players and matches, so the website has realistic data to show.
// Run with: npm run seed  (writes seed.db, never squash.db). Run the bot on it with: DATABASE_PATH=seed.db npm run dev
import { rmSync } from "node:fs";
import { openDatabase } from "./db.js";
import { expectedScore } from "./elo.js";
import { recordMatch } from "./services/matchService.js";
import { isValidScore } from "./validation.js";

const DATABASE_PATH = process.env.SEED_DATABASE_PATH || "seed.db";
const MATCH_COUNT = 120;
const DAYS_OF_HISTORY = 90;

// Each fake player has a hidden "true skill". Matches are won according to it, so the ratings should end up
// roughly in this order, which makes the seed data a nice sanity check of the Elo rules too.
const PLAYERS = [
  { id: "seed-1", name: "Nora", skill: 1250 },
  { id: "seed-2", name: "Jonas", skill: 1150 },
  { id: "seed-3", name: "Emma", skill: 1050 },
  { id: "seed-4", name: "Lars", skill: 1000 },
  { id: "seed-5", name: "Ingrid", skill: 900 },
  { id: "seed-6", name: "Ola", skill: 800 },
];

const FORMATS = ["bo1", "bo3", "bo5", "bo5", "ft6", "ft6"]; // bo5 and ft6 twice: picked more often

if (DATABASE_PATH.endsWith("squash.db")) {
  throw new Error("The seed script must never write to the real database.");
}

// A small seeded random number generator (mulberry32), so every run produces exactly the same data.
// Math.random() can't be seeded in JavaScript.
let state = 42;
function random(): number {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randomInt(maxExclusive: number): number {
  return Math.floor(random() * maxExclusive);
}

function pick<T>(items: T[]): T {
  return items[randomInt(items.length)]!;
}

// A random valid [winnerGames, loserGames] for the format.
function randomScore(format: string): [number, number] {
  switch (format) {
    case "bo1": return [1, 0];
    case "bo3": return [2, randomInt(2)];
    case "bo5": return [3, randomInt(3)];
    case "ft6": {
      if (random() < 0.2) {
        const winner = 7 + randomInt(3); // 7-5, 8-6 or 9-7
        return [winner, winner - 2];
      }
      return [6, randomInt(5)]; // 6-0 to 6-4
    }
    default: throw new Error(`Unknown format: ${format}`);
  }
}

rmSync(DATABASE_PATH, { force: true }); // start from scratch every time
openDatabase(DATABASE_PATH);

const start = Date.now() - DAYS_OF_HISTORY * 24 * 60 * 60 * 1000;
const step = (DAYS_OF_HISTORY * 24 * 60 * 60 * 1000) / MATCH_COUNT;

for (let i = 0; i < MATCH_COUNT; i++) {
  const a = pick(PLAYERS);
  const b = pick(PLAYERS.filter((p) => p !== a));
  const format = pick(FORMATS);
  const [winnerGames, loserGames] = randomScore(format);
  const aWins = random() < expectedScore(a.skill, b.skill);

  // Sanity check: the generator must only produce scores /result would accept.
  if (!isValidScore(format, winnerGames, loserGames)) {
    throw new Error(`Generated an invalid score: ${winnerGames}-${loserGames} (${format})`);
  }

  recordMatch({
    reporterId: a.id,
    reporterName: a.name,
    reporterAvatarUrl: null,
    opponentId: b.id,
    opponentName: b.name,
    opponentAvatarUrl: null,
    format,
    reporterGames: aWins ? winnerGames : loserGames,
    opponentGames: aWins ? loserGames : winnerGames,
    playedAt: new Date(start + i * step).toISOString(),
  });
}

console.log(`Seeded ${MATCH_COUNT} matches between ${PLAYERS.length} players into ${DATABASE_PATH}.`);
