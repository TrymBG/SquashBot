// Tests for the group endpoints through HTTP (inject), with real session cookies.
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../db.js";
import { signupUser } from "../testHelpers.js";
import { buildServer } from "./server.js";

let app: ReturnType<typeof buildServer>;
let anna: string, bo: string; // session tokens

beforeEach(async () => {
  openDatabase(":memory:");
  app = buildServer({ logger: false });
  anna = (await signupUser("anna")).sessionToken;
  bo = (await signupUser("bo")).sessionToken;
});

function call(method: "GET" | "POST" | "DELETE", url: string, session?: string, payload?: object) {
  return app.inject({ method, url, ...(session ? { cookies: { session } } : {}), ...(payload ? { payload } : {}) });
}

describe("group routes", () => {
  it("need a login", async () => {
    for (const [method, url] of [["GET", "/api/groups"], ["POST", "/api/groups"], ["GET", "/api/groups/1/leaderboard"]] as const) {
      assert.equal((await call(method, url)).statusCode, 401, url);
    }
  });

  it("create → share the link → join → both see the group and its ladder", async () => {
    const created = await call("POST", "/api/groups", anna, { name: "Tuesday crew" });
    assert.equal(created.statusCode, 201);
    const { id } = created.json();
    const { inviteCode } = (await call("GET", `/api/groups/${id}`, anna)).json();

    const preview = await call("GET", `/api/invites/${inviteCode}`, bo);
    assert.deepEqual(preview.json(), { id, name: "Tuesday crew", memberCount: 1 });
    assert.deepEqual((await call("POST", `/api/invites/${inviteCode}/join`, bo)).json(), { groupId: id });

    assert.equal((await call("GET", `/api/groups/${id}`, bo)).json().memberCount, 2);
    assert.equal((await call("GET", `/api/groups/${id}/leaderboard`, bo)).statusCode, 200);
  });

  it("answers 404 to non-members, also for the ladder", async () => {
    const { id } = (await call("POST", "/api/groups", anna, { name: "Private" })).json();

    assert.equal((await call("GET", `/api/groups/${id}`, bo)).statusCode, 404);
    assert.equal((await call("GET", `/api/groups/${id}/leaderboard`, bo)).statusCode, 404);
    assert.equal((await call("DELETE", `/api/groups/${id}`, bo)).statusCode, 404);
  });

  it("rejects a blank name and a malformed invite code with 400", async () => {
    assert.equal((await call("POST", "/api/groups", anna, { name: "   " })).statusCode, 400);
    assert.equal((await call("GET", "/api/invites/short", anna)).statusCode, 400);
  });
});
