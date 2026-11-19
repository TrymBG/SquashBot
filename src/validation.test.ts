// Tests for score validation, for every match format. Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidScore } from "./validation.js";

// [format, myGames, theirGames, valid?]. Scores work from either side: 3-1 and 1-3 are both valid bo5 scores.
const cases: [string, number, number, boolean][] = [
  ["bo1", 1, 0, true],
  ["bo1", 0, 1, true],
  ["bo1", 1, 1, false],
  ["bo3", 2, 1, true],
  ["bo3", 3, 0, false],
  ["bo5", 3, 2, true],
  ["bo5", 3, 3, false],
  ["bo5", 2, 1, false],
  ["ft6", 6, 4, true],
  ["ft6", 7, 5, true],
  ["ft6", 6, 5, false], // must win by 2 after 5–5
  ["ft6", 8, 5, false],
  // Fixed rallies: exactly N points are played, the score is in points.
  ["r15", 8, 7, true],
  ["r15", 7, 8, true],
  ["r15", 15, 0, true],
  ["r15", 9, 7, false], // 16 points, one rally too many
  ["r15", 8, 6, false], // 14 points, one rally missing
  ["r15", 8, 8, false],
  ["r11", 6, 5, true],
  ["r11", 8, 7, false], // that's a 15-rally score
  ["r21", 11, 10, true],
  ["r21", 21, 0, true],
  ["r13", 7, 6, false], // not one of the preset lengths
  ["bo7", 4, 0, false],
];

describe("isValidScore", () => {
  for (const [format, mine, theirs, valid] of cases) {
    it(`${format} ${mine}–${theirs} is ${valid ? "valid" : "invalid"}`, () => {
      assert.equal(isValidScore(format, mine, theirs), valid);
    });
  }
});
