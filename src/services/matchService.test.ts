// Tests for matchService, against a fresh in-memory database for every test. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPlayer, getRatingHistory, openDatabase } from "../db.js";
import { STARTING_RATING } from "../elo.js";
import { play } from "../testHelpers.js";
import { getLatestMatch, recordMatch, undoMatch } from "./matchService.js";

function rating(playerId: string): number {
  return getPlayer(playerId)!.rating;
}

beforeEach(() => {
  openDatabase(":memory:");
});

describe("recordMatch", () => {
  it("refreshes a player's name and avatar every time they play", () => {
    const report = {
      reporterId: "trym",
      reporterName: "Trym",
      reporterAvatarUrl: "https://cdn.discordapp.com/avatars/trym/old.png",
      opponentId: "ola",
      opponentName: "Ola",
      opponentAvatarUrl: null,
      format: "bo5",
      reporterGames: 3,
      opponentGames: 1,
    };
    recordMatch(report);
    recordMatch({ ...report, reporterName: "Trym G", reporterAvatarUrl: "https://cdn.discordapp.com/avatars/trym/new.png" });

    const trym = getPlayer("trym")!;
    assert.equal(trym.displayName, "Trym G");
    assert.equal(trym.avatarUrl, "https://cdn.discordapp.com/avatars/trym/new.png");
    assert.equal(getPlayer("ola")!.avatarUrl, null);
  });

  it("stores the given playedAt instead of now", () => {
    const id = recordMatch({
      reporterId: "trym",
      reporterName: "trym",
      reporterAvatarUrl: null,
      opponentId: "ola",
      opponentName: "ola",
      opponentAvatarUrl: null,
      format: "bo5",
      reporterGames: 3,
      opponentGames: 1,
      playedAt: "2026-01-15T18:00:00.000Z",
    }).matchId;

    assert.equal(getLatestMatch()!.id, id);
    assert.equal(getLatestMatch()!.playedAt, "2026-01-15T18:00:00.000Z");
  });
});

describe("undoMatch", () => {
  it("refuses to undo a match that is no longer the latest", () => {
    const first = play("trym", "ola", 3, 1);
    play("ola", "kari", 3, 0);
    const before = rating("trym");

    const result = undoMatch(first, "trym");

    assert.equal(result.ok, false);
    assert.equal(getLatestMatch()!.id, first + 1);
    assert.equal(rating("trym"), before);
  });

  it("puts both players back at the starting rating when the only match is undone", () => {
    const id = play("trym", "ola", 3, 1);

    const result = undoMatch(id, "trym");

    assert.equal(result.ok, true);
    assert.equal(getLatestMatch(), undefined);
    assert.equal(rating("trym"), STARTING_RATING);
    assert.equal(rating("ola"), STARTING_RATING);
    assert.deepEqual(getRatingHistory("trym"), []);
    assert.deepEqual(getRatingHistory("ola"), []);
  });

  it("puts a player back at the starting rating when their only match is undone", () => {
    play("trym", "ola", 3, 1);
    const kariMatch = play("kari", "trym", 3, 2);

    undoMatch(kariMatch, "kari");

    assert.equal(rating("kari"), STARTING_RATING);
    assert.deepEqual(getRatingHistory("kari"), []);
  });

  it("leaves the same ratings and history as if the match was never logged", () => {
    play("trym", "ola", 3, 1);
    play("ola", "kari", 3, 0);
    play("kari", "trym", 3, 2);
    const last = play("trym", "kari", 3, 2);
    undoMatch(last, "trym");
    const afterUndo = ["trym", "ola", "kari"].map((id) => ({ rating: rating(id), history: getRatingHistory(id) }));

    // Same three matches in a fresh database, without the undone one.
    openDatabase(":memory:");
    play("trym", "ola", 3, 1);
    play("ola", "kari", 3, 0);
    play("kari", "trym", 3, 2);
    const neverLogged = ["trym", "ola", "kari"].map((id) => ({ rating: rating(id), history: getRatingHistory(id) }));

    assert.deepEqual(afterUndo, neverLogged);
  });
});
