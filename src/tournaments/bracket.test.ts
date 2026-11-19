// Tests for the knockout bracket (pure, no database). Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bracketSize, buildKnockout, roundName, seedOrder, type KnockoutResult } from "./bracket.js";

// Seeds s1 (best) … sN, as ids.
function seeds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `s${i + 1}`);
}

const key = (round: number, position: number) => `${round}:${position}`;

describe("bracketSize and seedOrder", () => {
  it("rounds the player count up to a power of two", () => {
    assert.deepEqual([4, 5, 8, 9, 16].map(bracketSize), [4, 8, 8, 16, 16]);
  });

  it("places seeds so the best ones meet as late as possible", () => {
    assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
    assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
    assert.deepEqual(seedOrder(16), [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]);
  });
});

describe("buildKnockout: the start", () => {
  for (let n = 4; n <= 16; n++) {
    it(`${n} players: everyone starts exactly once (in round 1 or as a bye), byes go to the top seeds`, () => {
      const slots = buildKnockout(seeds(n), new Map(), { thirdPlace: false });
      const size = bracketSize(n);
      const byes = size - n;

      const round1 = slots.filter((s) => s.round === 1).flatMap((s) => [s.playerA, s.playerB]);
      const round2 = slots.filter((s) => s.round === 2).flatMap((s) => [s.playerA, s.playerB]).filter((p) => p !== null);
      // Round 1 has only real matches (both players known); bye players already sit in round 2.
      assert.ok(round1.every((p) => p !== null));
      assert.equal(round1.length, (n - byes));
      assert.deepEqual([...round2].sort(), seeds(n).slice(0, byes).sort(), "the byes are the top seeds");
      assert.equal(new Set([...round1, ...round2]).size, n, "everyone exactly once");

      // A full bracket: size − 1 matches in total, minus the byes (no match for a bye).
      assert.equal(slots.length, size - 1 - byes);
    });
  }

  it("8 players: 1 v 8, 4 v 5, 2 v 7, 3 v 6, later rounds empty", () => {
    const slots = buildKnockout(seeds(8), new Map(), { thirdPlace: false });

    assert.deepEqual(
      slots.filter((s) => s.round === 1).map((s) => `${s.playerA} v ${s.playerB}`),
      ["s1 v s8", "s4 v s5", "s2 v s7", "s3 v s6"],
    );
    assert.ok(slots.filter((s) => s.round > 1).every((s) => s.playerA === null && s.playerB === null));
  });
});

describe("buildKnockout: results move winners on", () => {
  it("a winner goes to the next round on the right side (position p → floor(p/2), side A when p is even)", () => {
    const results = new Map<string, KnockoutResult>([
      [key(1, 0), { winner: "s1", loser: "s8" }],
      [key(1, 1), { winner: "s5", loser: "s4" }],
      [key(1, 3), { winner: "s3", loser: "s6" }],
    ]);

    const slots = buildKnockout(seeds(8), results, { thirdPlace: false });
    const semi = (p: number) => slots.find((s) => s.round === 2 && s.position === p)!;

    assert.deepEqual([semi(0).playerA, semi(0).playerB], ["s1", "s5"]);
    assert.deepEqual([semi(1).playerA, semi(1).playerB], [null, "s3"]); // 2 v 7 not played yet
  });

  it("plays through to a champion, with a 3rd-place match for the semifinal losers", () => {
    const results = new Map<string, KnockoutResult>([
      [key(1, 0), { winner: "s1", loser: "s4" }],
      [key(1, 1), { winner: "s2", loser: "s3" }],
      [key(2, 0), { winner: "s2", loser: "s1" }],
      [key(2, 1), { winner: "s4", loser: "s3" }],
    ]);

    const slots = buildKnockout(seeds(4), results, { thirdPlace: true });

    const final = slots.find((s) => s.round === 2 && s.position === 0)!;
    const third = slots.find((s) => s.thirdPlace)!;
    assert.deepEqual([final.playerA, final.playerB], ["s1", "s2"]);
    assert.deepEqual([third.round, third.position, third.playerA, third.playerB], [2, 1, "s4", "s3"]);
  });

  it("a bye player waits in round 2 for the winner of their side", () => {
    // 5 players: s1, s2, s3 have byes; only s4 v s5 plays in round 1.
    const slots = buildKnockout(seeds(5), new Map([[key(1, 1), { winner: "s5", loser: "s4" }]]), { thirdPlace: false });

    const r2 = slots.find((s) => s.round === 2 && s.position === 0)!;
    assert.deepEqual([r2.playerA, r2.playerB], ["s1", "s5"]);
  });

  it("refuses fewer than 2 players or the same player twice", () => {
    assert.throws(() => buildKnockout(["s1"], new Map(), { thirdPlace: false }));
    assert.throws(() => buildKnockout(["s1", "s2", "s1"], new Map(), { thirdPlace: false }));
  });
});

describe("roundName", () => {
  it("names the last rounds, counting back from the final", () => {
    assert.deepEqual([1, 2, 3, 4].map((r) => roundName(r, 4)), ["Round of 16", "Quarterfinals", "Semifinals", "Final"]);
    assert.equal(roundName(1, 5), "Round 1");
  });
});
