// Tests for statsService, against a fresh in-memory database for every test. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPlayer, openDatabase } from "../db.js";
import { STARTING_RATING } from "../elo.js";
import { play } from "../testHelpers.js";
import { undoMatch } from "./matchService.js";
import { getHeadToHead, getLeaderboard, getPlayerMatches, getPlayerProfile } from "./statsService.js";

beforeEach(() => {
  openDatabase(":memory:");
});

describe("getPlayerProfile", () => {
  it("returns undefined for an unknown player", () => {
    assert.equal(getPlayerProfile("nobody"), undefined);
  });

  it("computes record, form, streak and chart points from the player's matches", () => {
    const m1 = play("trym", "ola", 3, 0); // W
    const m2 = play("trym", "kari", 3, 1); // W
    const m3 = play("ola", "trym", 3, 2); // L
    play("kari", "ola", 3, 0); // trym not playing
    const m5 = play("trym", "ola", 3, 1); // W

    const profile = getPlayerProfile("trym")!;

    assert.equal(profile.wins, 3);
    assert.equal(profile.losses, 1);
    assert.equal(profile.winRate, 0.75);
    assert.deepEqual(profile.recentForm, ["W", "L", "W", "W"]); // newest first
    assert.deepEqual(profile.streak, { result: "W", count: 1 });

    // Chart: one point per match, oldest first, ending at the current rating.
    assert.deepEqual(
      profile.ratingHistory.map((point) => point.matchId),
      [m1, m2, m3, m5],
    );
    assert.equal(profile.ratingHistory.at(-1)!.rating, profile.rating);
    assert.equal(profile.peakRating, Math.max(...profile.ratingHistory.map((point) => point.rating)));

    // Same place as on the leaderboard.
    const expectedPosition = getLeaderboard().findIndex((row) => row.id === "trym") + 1;
    assert.equal(profile.position, expectedPosition);
    assert.equal(profile.rankedPlayers, 3);
  });

  it("counts a streak longer than the recent form", () => {
    for (let i = 0; i < 7; i++) play("trym", "ola", 3, 0);

    const profile = getPlayerProfile("trym")!;

    assert.equal(profile.recentForm.length, 5);
    assert.deepEqual(profile.streak, { result: "W", count: 7 });
  });

  it("keeps the starting rating as peak for a player who has only lost", () => {
    play("trym", "ola", 3, 0);

    assert.equal(getPlayerProfile("ola")!.peakRating, STARTING_RATING);
  });

  it("handles a player with no matches left after an undo", () => {
    const matchId = play("trym", "ola", 3, 0);
    undoMatch(matchId, "trym");

    const profile = getPlayerProfile("trym")!;

    assert.equal(profile.rating, STARTING_RATING);
    assert.equal(profile.peakRating, STARTING_RATING);
    assert.equal(profile.position, null);
    assert.equal(profile.rankedPlayers, 0);
    assert.equal(profile.winRate, null);
    assert.equal(profile.streak, null);
    assert.deepEqual(profile.recentForm, []);
    assert.deepEqual(profile.ratingHistory, []);
  });
});

describe("getPlayerMatches", () => {
  it("returns undefined for an unknown player", () => {
    assert.equal(getPlayerMatches("nobody", 20), undefined);
  });

  it("shows each match from the player's side", () => {
    const matchId = play("ola", "trym", 3, 2); // ola reports a win over trym

    const [match] = getPlayerMatches("trym", 20)!.matches;

    assert.equal(match!.matchId, matchId);
    assert.equal(match!.opponentId, "ola");
    assert.equal(match!.opponentName, "ola");
    assert.equal(match!.won, false);
    assert.equal(match!.myGames, 2);
    assert.equal(match!.opponentGames, 3);
    assert.equal(match!.ratingBefore, STARTING_RATING);
    assert.equal(match!.ratingAfter, getPlayer("trym")!.rating);
  });

  it("pages newest first with a cursor until the last page", () => {
    const ids = [1, 2, 3, 4, 5].map(() => play("trym", "ola", 3, 0));

    const page1 = getPlayerMatches("trym", 2)!;
    const page2 = getPlayerMatches("trym", 2, page1.nextBefore!)!;
    const page3 = getPlayerMatches("trym", 2, page2.nextBefore!)!;

    const seen = [...page1.matches, ...page2.matches, ...page3.matches].map((m) => m.matchId);
    assert.deepEqual(seen, ids.reverse());
    assert.equal(page3.matches.length, 1);
    assert.equal(page3.nextBefore, null);
  });
});

describe("getHeadToHead", () => {
  it("returns undefined if either player is unknown", () => {
    play("trym", "ola", 3, 0);

    assert.equal(getHeadToHead("trym", "nobody"), undefined);
    assert.equal(getHeadToHead("nobody", "trym"), undefined);
  });

  it("counts only the matches between the two players", () => {
    play("trym", "ola", 3, 0);
    play("ola", "trym", 3, 1);
    play("trym", "ola", 3, 2);
    play("trym", "kari", 3, 0); // not part of trym vs ola

    const h2h = getHeadToHead("trym", "ola")!;

    assert.equal(h2h.player.wins, 2);
    assert.equal(h2h.opponent.wins, 1);
    assert.equal(h2h.recentMatches.length, 3);
    assert.ok(h2h.recentMatches.every((m) => m.opponentId === "ola"));
  });

  it("shows at most the last 5 matches", () => {
    for (let i = 0; i < 7; i++) play("trym", "ola", 3, 0);

    const h2h = getHeadToHead("trym", "ola")!;

    assert.equal(h2h.player.wins, 7);
    assert.equal(h2h.recentMatches.length, 5);
  });
});
