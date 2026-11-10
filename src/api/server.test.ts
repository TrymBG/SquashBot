// Tests for the website API, using `inject` (a fake HTTP request, no real port) and a fresh in-memory database.
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../db.js";
import { recordMatch } from "../services/matchService.js";
import { buildServer } from "./server.js";

// "reporter beat/lost to opponent myGames-theirGames in bo5", with the id doubling as the display name.
function play(reporterId: string, opponentId: string, myGames: number, theirGames: number): void {
  recordMatch({
    reporterId,
    reporterName: reporterId,
    reporterAvatarUrl: null,
    opponentId,
    opponentName: opponentId,
    opponentAvatarUrl: null,
    format: "bo5",
    reporterGames: myGames,
    opponentGames: theirGames,
  });
}

beforeEach(() => {
  openDatabase(":memory:");
});

describe("GET /api/leaderboard", () => {
  it("returns an empty list when no matches are logged", async () => {
    const response = await buildServer().inject({ method: "GET", url: "/api/leaderboard" });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), []);
  });

  it("returns players highest rating first, with wins and losses", async () => {
    play("trym", "ola", 3, 0);
    play("trym", "kari", 3, 1);
    play("ola", "kari", 3, 2);

    const response = await buildServer().inject({ method: "GET", url: "/api/leaderboard" });

    assert.equal(response.statusCode, 200);
    const players = response.json() as { id: string; wins: number; losses: number }[];
    assert.deepEqual(
      players.map((p) => [p.id, p.wins, p.losses]),
      [
        ["trym", 2, 0],
        ["ola", 1, 1],
        ["kari", 0, 2],
      ],
    );
  });

  it("returns 404 for an unknown route", async () => {
    const response = await buildServer().inject({ method: "GET", url: "/api/nope" });

    assert.equal(response.statusCode, 404);
  });
});
