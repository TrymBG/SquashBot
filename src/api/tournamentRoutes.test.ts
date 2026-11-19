// Tests for the tournament endpoints over HTTP (inject), with real session cookies. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { openDatabase } from "../db.js";
import type { PublicUser } from "../services/authService.js";
import { signupUser, TEST_INVITE_CODE } from "../testHelpers.js";
import { buildServer } from "./server.js";

type Who = { user: PublicUser; sessionToken: string };

let app: FastifyInstance;
let anna: Who;
let bo: Who;
let cato: Who;

beforeEach(async () => {
  openDatabase(":memory:");
  app = buildServer({ inviteCode: TEST_INVITE_CODE, cookieSecure: false });
  anna = await signupUser("anna");
  bo = await signupUser("bo");
  cato = await signupUser("cato");
});

function as(who: Who | null, method: "GET" | "POST" | "DELETE", url: string, payload?: object) {
  return app.inject({
    method,
    url,
    ...(payload ? { payload } : {}),
    ...(who ? { cookies: { session: who.sessionToken } } : {}),
  });
}

async function createCup(): Promise<number> {
  const response = await as(anna, "POST", "/api/tournaments", { name: "Winter cup", matchFormat: "r15", ranking: "points" });
  assert.equal(response.statusCode, 201);
  return response.json().tournament.id;
}

describe("tournament endpoints", () => {
  it("viewing is public; creating and changing need a login (401 before validation)", async () => {
    const id = await createCup();

    assert.equal((await as(null, "GET", "/api/tournaments")).statusCode, 200);
    assert.equal((await as(null, "GET", `/api/tournaments/${id}`)).statusCode, 200);
    for (const [method, url] of [
      ["POST", "/api/tournaments"],
      ["POST", `/api/tournaments/${id}/players`],
      ["DELETE", `/api/tournaments/${id}/players/x`],
      ["POST", `/api/tournaments/${id}/start`],
    ] as const) {
      assert.equal((await as(null, method, url, method === "POST" ? {} : undefined)).statusCode, 401, `${method} ${url}`);
    }
  });

  it("full flow: create → add players → start → report a match → standings", async () => {
    const id = await createCup();
    for (const who of [anna, bo, cato]) {
      assert.equal((await as(anna, "POST", `/api/tournaments/${id}/players`, { playerId: who.user.playerId })).statusCode, 200);
    }
    assert.equal((await as(anna, "POST", `/api/tournaments/${id}/start`)).statusCode, 200);

    const details = (await as(null, "GET", `/api/tournaments/${id}`)).json();
    assert.equal(details.matches.length, 3);
    const annaBo = details.matches.find(
      (m: { playerA: { id: string }; playerB: { id: string } }) =>
        [m.playerA.id, m.playerB.id].sort().join() === [anna.user.playerId, bo.user.playerId].sort().join(),
    );

    const reported = await as(anna, "POST", "/api/reports", {
      opponentId: bo.user.playerId,
      format: "r15",
      myGames: 8,
      opponentGames: 7,
      tournamentMatchId: annaBo.id,
    });
    assert.equal(reported.statusCode, 201);
    assert.equal((await as(bo, "POST", `/api/reports/${reported.json().report.id}/confirm`)).statusCode, 200);

    const standings = (await as(null, "GET", `/api/tournaments/${id}`)).json().standings;
    assert.deepEqual(
      standings.map((r: { displayName: string; scoreFor: number }) => [r.displayName, r.scoreFor]),
      [
        ["anna", 8],
        ["bo", 7],
        ["cato", 0],
      ],
    );
  });

  it("maps failures to 400, 403, 404 and 409", async () => {
    const id = await createCup();

    assert.equal((await as(anna, "POST", "/api/tournaments", { name: "X", matchFormat: "bo3", ranking: "points" })).statusCode, 400);
    assert.equal((await as(anna, "POST", "/api/tournaments", { name: "   ", matchFormat: "r15", ranking: "wins" })).statusCode, 400);
    assert.equal((await as(bo, "POST", `/api/tournaments/${id}/players`, { playerId: bo.user.playerId })).statusCode, 403);
    assert.equal((await as(anna, "POST", `/api/tournaments/${id}/players`, { playerId: "nobody" })).statusCode, 404);
    assert.equal((await as(anna, "POST", `/api/tournaments/${id}/start`)).statusCode, 409); // too few players
    assert.equal((await as(anna, "POST", "/api/tournaments/999/start")).statusCode, 404);
    assert.equal((await as(null, "GET", "/api/tournaments/999")).statusCode, 404);
    assert.deepEqual((await as(null, "GET", "/api/tournaments/999")).json(), { error: "Tournament not found" });
  });

  it("a tournament report with the wrong format is refused with 400", async () => {
    const id = await createCup();
    for (const who of [anna, bo, cato]) {
      await as(anna, "POST", `/api/tournaments/${id}/players`, { playerId: who.user.playerId });
    }
    await as(anna, "POST", `/api/tournaments/${id}/start`);
    const matchId = (await as(null, "GET", `/api/tournaments/${id}`)).json().matches[0].id;
    const { playerA, playerB } = (await as(null, "GET", `/api/tournaments/${id}`)).json().matches[0];
    const reporter = [anna, bo, cato].find((w) => w.user.playerId === playerA.id)!;

    const response = await as(reporter, "POST", "/api/reports", {
      opponentId: playerB.id,
      format: "bo3",
      myGames: 2,
      opponentGames: 0,
      tournamentMatchId: matchId,
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, "This tournament uses a different format");
  });
});
