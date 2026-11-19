// Tests for round-robin standings (pure, no database). Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { roundRobinStandings, type PlayedMatch } from "./standings.js";

// "a beat b 3–1" style helper: scores are from a's side.
function m(playerA: string, playerB: string, scoreA: number, scoreB: number): PlayedMatch {
  return { playerA, playerB, scoreA, scoreB };
}

function order(rows: { playerId: string; position: number }[]): string[] {
  return rows.map((r) => `${r.position}:${r.playerId}`);
}

describe("roundRobinStandings: wins", () => {
  it("ranks by wins and counts played, wins, losses and scores", () => {
    const rows = roundRobinStandings(["a", "b", "c"], [m("a", "b", 3, 1), m("a", "c", 3, 0), m("b", "c", 3, 2)], "wins");

    assert.deepEqual(order(rows), ["1:a", "2:b", "3:c"]);
    assert.deepEqual(rows[0], { playerId: "a", position: 1, played: 2, wins: 2, losses: 0, scoreFor: 6, scoreAgainst: 1 });
    assert.deepEqual(rows[2], { playerId: "c", position: 3, played: 2, wins: 0, losses: 2, scoreFor: 2, scoreAgainst: 6 });
  });

  it("breaks a two-way tie on wins with their head-to-head match, before score difference", () => {
    // a and b both have 2 wins. b has the better score difference, but a beat b, so a is ahead.
    const rows = roundRobinStandings(
      ["a", "b", "c", "d"],
      [m("a", "b", 3, 2), m("a", "c", 0, 3), m("a", "d", 3, 2), m("b", "c", 3, 0), m("b", "d", 3, 0), m("c", "d", 0, 3)],
      "wins",
    );

    assert.deepEqual(order(rows).slice(0, 2), ["1:a", "2:b"]);
  });

  it("breaks a three-way tie with a mini-league of their matches against each other", () => {
    // Wins: e 3, then a, b, c with 2 each, d 1. Among a, b, c: a beat both (2), b beat c (1), c none (0).
    const rows = roundRobinStandings(
      ["a", "b", "c", "d", "e"],
      [
        m("a", "b", 3, 0), m("a", "c", 3, 0), m("b", "c", 3, 0), // the mini-league
        m("d", "a", 3, 0), m("e", "a", 3, 0),
        m("b", "d", 3, 0), m("e", "b", 3, 0),
        m("c", "d", 3, 0), m("c", "e", 3, 0),
        m("e", "d", 3, 0),
      ],
      "wins",
    );

    assert.deepEqual(order(rows), ["1:e", "2:a", "3:b", "4:c", "5:d"]);
  });

  it("falls back to score difference when head-to-head can't separate (a > b > c > a)", () => {
    // Each has 1 win and 1 h2h win, so score difference decides: c +2, a 0, b −2.
    const rows = roundRobinStandings(["a", "b", "c"], [m("a", "b", 3, 0), m("b", "c", 3, 2), m("c", "a", 3, 0)], "wins");

    assert.deepEqual(order(rows), ["1:c", "2:a", "3:b"]);
  });

  it("gives a shared place when everything is equal, keeping the given order", () => {
    const rows = roundRobinStandings(["b", "a", "c", "d"], [m("a", "c", 3, 0), m("b", "d", 3, 0)], "wins");

    assert.deepEqual(order(rows), ["1:b", "1:a", "3:c", "3:d"]);
  });

  it("lists everyone, also before anyone has played", () => {
    const rows = roundRobinStandings(["a", "b"], [], "wins");

    assert.deepEqual(order(rows), ["1:a", "1:b"]);
    assert.equal(rows[0]!.played, 0);
  });
});

describe("roundRobinStandings: points", () => {
  it("ranks by total points scored; the loser keeps their points (8–7 gives 8 and 7)", () => {
    // 15-rally matches. b loses twice, but narrowly, and ends with the most points.
    const rows = roundRobinStandings(["a", "b", "c"], [m("a", "b", 8, 7), m("b", "c", 13, 2), m("c", "a", 8, 7)], "points");

    // points: a 8+7 = 15, b 7+13 = 20, c 2+8 = 10
    assert.deepEqual(order(rows), ["1:b", "2:a", "3:c"]);
    assert.deepEqual(
      rows.map((r) => [r.playerId, r.scoreFor, r.wins]),
      [
        ["b", 20, 1],
        ["a", 15, 1],
        ["c", 10, 1],
      ],
    );
  });

  it("breaks a tie on points with head-to-head", () => {
    // a 7 + 9 = 16, b 8 + 8 = 16, c 6 + 7 = 13. a and b are tied, b won their match, so b is ahead.
    const rows = roundRobinStandings(["a", "b", "c"], [m("a", "b", 7, 8), m("a", "c", 9, 6), m("b", "c", 8, 7)], "points");

    assert.deepEqual(order(rows), ["1:b", "2:a", "3:c"]);
  });

  it("then with match wins, when the tied players haven't met yet", () => {
    // a 8 + 6 = 14 with 1 win, b 7 + 7 = 14 with 0 wins; a and b haven't played each other.
    const rows = roundRobinStandings(
      ["a", "b", "c", "d"],
      [m("a", "c", 8, 7), m("a", "d", 6, 9), m("b", "c", 7, 8), m("b", "d", 7, 8)],
      "points",
    );

    assert.deepEqual(order(rows), ["1:d", "2:c", "3:a", "4:b"]); // d 17, c 15, then a ahead of b on wins
  });
});
