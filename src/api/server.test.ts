// Tests for the website API, using `inject` (a fake HTTP request, no real port) and a fresh in-memory database.
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../db.js";
import { play } from "../testHelpers.js";
import { buildServer } from "./server.js";

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

  it("returns 404 for an unknown route (no such endpoint)", async () => {
    const response = await buildServer().inject({ method: "GET", url: "/api/nope" });

    assert.equal(response.statusCode, 404);
  });
});

// Sends GET `url` to a fresh server and returns the status code and parsed JSON body.
async function get(url: string): Promise<{ status: number; body: any }> {
  const response = await buildServer().inject({ method: "GET", url });
  return { status: response.statusCode, body: response.json() };
}

describe("GET /api/players/:id", () => {
  it("returns the profile", async () => {
    play("trym", "ola", 3, 0);

    const { status, body } = await get("/api/players/trym");

    assert.equal(status, 200);
    assert.equal(body.id, "trym");
    assert.equal(body.wins, 1);
    assert.deepEqual(body.recentForm, ["W"]);
  });

  it("returns 404 for an unknown player", async () => {
    const { status, body } = await get("/api/players/nobody");

    assert.equal(status, 404);
    assert.deepEqual(body, { error: "Player not found" });
  });
});

describe("GET /api/players/:id/matches", () => {
  it("defaults to 20 matches and pages with ?before", async () => {
    for (let i = 0; i < 25; i++) play("trym", "ola", 3, 0);

    const first = await get("/api/players/trym/matches");
    const second = await get(`/api/players/trym/matches?before=${first.body.nextBefore}`);

    assert.equal(first.status, 200);
    assert.equal(first.body.matches.length, 20);
    assert.equal(second.body.matches.length, 5);
    assert.equal(second.body.nextBefore, null);
  });

  it("rejects an invalid limit or cursor with 400", async () => {
    play("trym", "ola", 3, 0);

    for (const query of ["limit=0", "limit=101", "limit=abc", "before=-1", "before=1.5"]) {
      const { status } = await get(`/api/players/trym/matches?${query}`);
      assert.equal(status, 400, query);
    }
  });

  it("returns 404 for an unknown player", async () => {
    const { status } = await get("/api/players/nobody/matches");

    assert.equal(status, 404);
  });
});

describe("GET /api/h2h/:id/:opponentId", () => {
  it("returns the record between two players", async () => {
    play("trym", "ola", 3, 0);
    play("ola", "trym", 3, 1);

    const { status, body } = await get("/api/h2h/trym/ola");

    assert.equal(status, 200);
    assert.equal(body.player.wins, 1);
    assert.equal(body.opponent.wins, 1);
  });

  it("returns 400 for the same player twice", async () => {
    play("trym", "ola", 3, 0);

    const { status } = await get("/api/h2h/trym/trym");

    assert.equal(status, 400);
  });

  it("returns 404 if either player is unknown", async () => {
    play("trym", "ola", 3, 0);

    const { status } = await get("/api/h2h/trym/nobody");

    assert.equal(status, 404);
  });
});
