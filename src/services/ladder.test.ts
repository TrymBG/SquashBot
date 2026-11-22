// Tests for the ladder movement on the leaderboard: places gained or lost since 7 days ago.
// Fresh in-memory database for every test. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../db.js";
import { recordMatch } from "./matchService.js";
import { getLeaderboard } from "./statsService.js";

const NOW = new Date("2026-11-22T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

// winner beat loser 3–0, `daysAgo` days before NOW. Ids double as names.
function beat(winner: string, loser: string, daysAgo: number): void {
  recordMatch({
    reporterId: winner,
    reporterName: winner,
    reporterAvatarUrl: null,
    opponentId: loser,
    opponentName: loser,
    opponentAvatarUrl: null,
    format: "bo5",
    reporterGames: 3,
    opponentGames: 0,
    playedAt: new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString(),
  });
}

function movement(): [string, number | null][] {
  return getLeaderboard(NOW).map((p) => [p.id, p.rankChange]);
}

beforeEach(() => {
  openDatabase(":memory:");
});

describe("leaderboard rankChange", () => {
  it("is 0 for everyone when nothing was played this week", () => {
    beat("anna", "bo", 10);

    assert.deepEqual(movement(), [
      ["anna", 0],
      ["bo", 0],
    ]);
  });

  it("counts places gained (+) and lost (−) since a week ago", () => {
    beat("anna", "bo", 10); // a week ago: anna 1st, bo 2nd
    beat("bo", "anna", 2); // this week: bo passes anna
    beat("bo", "anna", 1);

    assert.deepEqual(movement(), [
      ["bo", 1],
      ["anna", -1],
    ]);
  });

  it("is null for a player who is new on the ladder this week", () => {
    beat("anna", "bo", 10);
    beat("cato", "bo", 1);

    const cato = getLeaderboard(NOW).find((p) => p.id === "cato")!;
    assert.equal(cato.rankChange, null);
  });
});
