// Tests for the round-robin schedule (pure, no database). Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { roundRobinSchedule } from "./schedule.js";

function players(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

// "p1-p2" with the two ids sorted, so a pair is the same whichever way round it was scheduled.
function pairKey(a: string, b: string): string {
  return [a, b].sort().join("-");
}

describe("roundRobinSchedule", () => {
  for (let n = 3; n <= 16; n++) {
    it(`${n} players: every pair meets exactly once, nobody plays twice in a round`, () => {
      const schedule = roundRobinSchedule(players(n));

      // Every pair exactly once: n × (n − 1) / 2 matches, all different.
      const keys = schedule.map((m) => pairKey(m.playerA, m.playerB));
      assert.equal(keys.length, (n * (n - 1)) / 2);
      assert.equal(new Set(keys).size, keys.length);
      assert.ok(schedule.every((m) => m.playerA !== m.playerB));

      // Rounds: n − 1 for an even number of players, n for odd (everyone sits out once).
      const rounds = new Set(schedule.map((m) => m.round));
      assert.equal(rounds.size, n % 2 === 0 ? n - 1 : n);

      for (const round of rounds) {
        const inRound = schedule.filter((m) => m.round === round).flatMap((m) => [m.playerA, m.playerB]);
        assert.equal(new Set(inRound).size, inRound.length, `round ${round}: someone plays twice`);
        assert.equal(inRound.length, n % 2 === 0 ? n : n - 1, `round ${round}: wrong number of players`);
      }
    });
  }

  it("gives each player exactly one round off when the number is odd", () => {
    const schedule = roundRobinSchedule(players(5));
    for (const player of players(5)) {
      const roundsPlayed = new Set(schedule.filter((m) => m.playerA === player || m.playerB === player).map((m) => m.round));
      assert.equal(roundsPlayed.size, 4, player); // 5 rounds, 4 matches
    }
  });

  it("is the same every time for the same players (deterministic), with rounds numbered from 1", () => {
    assert.deepEqual(roundRobinSchedule(players(6)), roundRobinSchedule(players(6)));
    assert.equal(Math.min(...roundRobinSchedule(players(6)).map((m) => m.round)), 1);
  });

  it("refuses fewer than 2 players or the same player twice", () => {
    assert.throws(() => roundRobinSchedule(["p1"]));
    assert.throws(() => roundRobinSchedule(["p1", "p2", "p1"]));
  });
});
