// Unit tests for elo.ts. Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseK, calculateNewRatings, expectedScore, formatMultiplier, marginFactor } from "./elo.js";

// Floating point math is never exact, so compare with a small tolerance.
function assertClose(actual: number, expected: number, tolerance = 0.01): void {
  assert.ok(Math.abs(actual - expected) < tolerance, `expected ${expected}, got ${actual}`);
}

const established = { rating: 1000, matchesPlayed: 20 };

describe("expectedScore", () => {
  it("is 0.5 for equal ratings", () => {
    assert.equal(expectedScore(1000, 1000), 0.5);
  });

  it("is about 0.76 when 200 points higher", () => {
    assertClose(expectedScore(1200, 1000), 0.76);
  });

  it("is symmetric: both players' chances add up to 1", () => {
    assertClose(expectedScore(1100, 950) + expectedScore(950, 1100), 1);
  });
});

describe("baseK", () => {
  it("is 48 for new players and 32 from match 10", () => {
    assert.equal(baseK(0), 48);
    assert.equal(baseK(9), 48);
    assert.equal(baseK(10), 32);
  });
});

describe("formatMultiplier", () => {
  it("returns the multiplier for each format", () => {
    assert.equal(formatMultiplier("bo1"), 0.5);
    assert.equal(formatMultiplier("ft6"), 1.25);
  });

  it("throws for an unknown format", () => {
    assert.throws(() => formatMultiplier("bo7"));
  });
});

describe("marginFactor", () => {
  it("rewards big wins a little more than narrow ones", () => {
    assertClose(marginFactor(3, 0), 1.2);
    assertClose(marginFactor(3, 2), 1.067);
    assertClose(marginFactor(7, 5), 1.057);
  });

  it("treats a whitewash the same in every format", () => {
    assertClose(marginFactor(3, 0), marginFactor(6, 0));
  });
});

describe("calculateNewRatings", () => {
  it("gives +19.2 / -19.2 for a 3-0 Bo5 between equal established players", () => {
    // K = 32 * 1.0 (bo5) * 1.2 (3-0) = 38.4, change = 38.4 * 0.5 = 19.2
    const result = calculateNewRatings(established, established, { format: "bo5", winnerGames: 3, loserGames: 0 });
    assertClose(result.winnerRating, 1019.2);
    assertClose(result.loserRating, 980.8);
  });

  it("is symmetric when both players have the same K", () => {
    const result = calculateNewRatings(
      { rating: 1100, matchesPlayed: 15 },
      { rating: 950, matchesPlayed: 30 },
      { format: "bo3", winnerGames: 2, loserGames: 1 },
    );
    assertClose(result.winnerRating - 1100, 950 - result.loserRating);
  });

  it("lets a new player gain more than an established player loses (FIDE-style)", () => {
    const newPlayer = { rating: 1000, matchesPlayed: 2 };
    const result = calculateNewRatings(newPlayer, established, { format: "bo5", winnerGames: 3, loserGames: 1 });
    const gained = result.winnerRating - 1000;
    const lost = 1000 - result.loserRating;
    assert.ok(gained > lost, `gained ${gained} should be more than lost ${lost}`);
  });

  it("gives more for an upset than for beating a weaker player", () => {
    const strong = { rating: 1200, matchesPlayed: 20 };
    const weak = { rating: 1000, matchesPlayed: 20 };
    const match = { format: "bo5", winnerGames: 3, loserGames: 1 };

    const upsetGain = calculateNewRatings(weak, strong, match).winnerRating - weak.rating;
    const expectedGain = calculateNewRatings(strong, weak, match).winnerRating - strong.rating;
    assert.ok(upsetGain > expectedGain);
  });

  it("moves less in a Bo1 than in a Bo5", () => {
    const bo1 = calculateNewRatings(established, established, { format: "bo1", winnerGames: 1, loserGames: 0 });
    const bo5 = calculateNewRatings(established, established, { format: "bo5", winnerGames: 3, loserGames: 0 });
    assert.ok(bo1.winnerRating < bo5.winnerRating);
  });
});
