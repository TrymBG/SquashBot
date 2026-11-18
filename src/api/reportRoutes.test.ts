// Tests for the report endpoints over HTTP (inject), with two users and their session cookies. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { openDatabase } from "../db.js";
import type { PublicUser } from "../services/authService.js";
import { signupUser, TEST_INVITE_CODE } from "../testHelpers.js";
import { buildServer } from "./server.js";

let app: FastifyInstance;
let trym: { user: PublicUser; sessionToken: string };
let ola: { user: PublicUser; sessionToken: string };

beforeEach(async () => {
  openDatabase(":memory:");
  app = buildServer({ inviteCode: TEST_INVITE_CODE, cookieSecure: false });
  trym = await signupUser("trym");
  ola = await signupUser("ola");
});

function as(who: { sessionToken: string } | null, method: "GET" | "POST", url: string, payload?: object) {
  return app.inject({
    method,
    url,
    ...(payload ? { payload } : {}),
    ...(who ? { cookies: { session: who.sessionToken } } : {}),
  });
}

async function reportWin(): Promise<number> {
  const response = await as(trym, "POST", "/api/reports", { opponentId: ola.user.playerId, format: "bo5", myGames: 3, opponentGames: 1 });
  assert.equal(response.statusCode, 201);
  return response.json().report.id;
}

describe("report endpoints", () => {
  it("all need a login, checked before input validation (401, never 400)", async () => {
    for (const [method, url] of [
      ["GET", "/api/opponents"],
      ["GET", "/api/reports"],
      ["POST", "/api/reports"], // empty body would be a 400 for a logged-in user
      ["POST", "/api/reports/abc/confirm"], // bad id would be a 400 for a logged-in user
      ["POST", "/api/reports/1/reject"],
      ["POST", "/api/reports/1/cancel"],
    ] as const) {
      const response = await as(null, method, url, method === "POST" ? {} : undefined);
      assert.equal(response.statusCode, 401, `${method} ${url}`);
    }
  });

  it("doesn't put a login wall on the public stats routes", async () => {
    assert.equal((await as(null, "GET", "/api/leaderboard")).statusCode, 200);
  });

  it("full flow: report → shows as incoming for the opponent → confirm → on both profiles", async () => {
    const reportId = await reportWin();

    const olaLists = (await as(ola, "GET", "/api/reports")).json();
    assert.deepEqual(olaLists.incoming.map((r: { id: number }) => r.id), [reportId]);
    assert.deepEqual((await as(trym, "GET", "/api/reports")).json().outgoing.map((r: { id: number }) => r.id), [reportId]);

    const confirmed = await as(ola, "POST", `/api/reports/${reportId}/confirm`);
    assert.equal(confirmed.statusCode, 200);
    assert.equal(typeof confirmed.json().matchId, "number");

    const olaProfile = (await as(null, "GET", `/api/players/${ola.user.playerId}`)).json();
    assert.equal(olaProfile.losses, 1);
    assert.ok(olaProfile.rating < 1000);
    assert.equal((await as(ola, "GET", "/api/reports")).json().incoming.length, 0);
  });

  it("maps failures to 403, 404 and 409", async () => {
    const reportId = await reportWin();

    assert.equal((await as(trym, "POST", `/api/reports/${reportId}/confirm`)).statusCode, 403); // reporter can't confirm
    assert.equal((await as(ola, "POST", `/api/reports/${reportId}/cancel`)).statusCode, 403); // opponent can't cancel
    assert.equal((await as(ola, "POST", "/api/reports/9999/confirm")).statusCode, 404);
    assert.equal((await as(ola, "POST", `/api/reports/${reportId}/reject`)).statusCode, 200);
    assert.equal((await as(ola, "POST", `/api/reports/${reportId}/confirm`)).statusCode, 409); // already rejected
  });

  it("rejects bad input with 400 or 404", async () => {
    const base = { opponentId: ola.user.playerId, format: "bo5", myGames: 3, opponentGames: 1 };

    for (const bad of [
      { ...base, format: "bo7" },
      { ...base, myGames: -1 },
      { ...base, myGames: 2.5 },
      { ...base, myGames: 3, opponentGames: 3 }, // impossible score
      { ...base, opponentId: trym.user.playerId }, // yourself
      { ...base, playedAt: "yesterday" },
      { ...base, playedAt: "2030-01-01T00:00:00Z" }, // future
    ]) {
      assert.equal((await as(trym, "POST", "/api/reports", bad)).statusCode, 400, JSON.stringify(bad));
    }
    assert.equal((await as(trym, "POST", "/api/reports", { ...base, opponentId: "nobody" })).statusCode, 404);
    assert.equal((await as(ola, "POST", "/api/reports/abc/confirm")).statusCode, 400);
  });

  it("lists opponents with an account, not yourself", async () => {
    const response = await as(trym, "GET", "/api/opponents");

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().map((p: { displayName: string }) => p.displayName), ["ola"]);
  });
});
