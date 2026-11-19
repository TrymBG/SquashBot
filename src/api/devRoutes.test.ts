// Tests for the dev-only "Log in as…" routes and the two locks that keep them out of production. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { devLoginEnabled } from "../config.js";
import { openDatabase } from "../db.js";
import { signupUser, TEST_INVITE_CODE } from "../testHelpers.js";
import { buildServer } from "./server.js";

beforeEach(() => {
  openDatabase(":memory:");
});

describe("devLoginEnabled (the two locks)", () => {
  it("is only on with DEV_LOGIN=1 and never in production", () => {
    assert.equal(devLoginEnabled({ DEV_LOGIN: "1" }), true);
    assert.equal(devLoginEnabled({ DEV_LOGIN: "1", NODE_ENV: "development" }), true);
    assert.equal(devLoginEnabled({ DEV_LOGIN: "1", NODE_ENV: "production" }), false);
    assert.equal(devLoginEnabled({}), false);
    assert.equal(devLoginEnabled({ DEV_LOGIN: "true" }), false);
  });
});

describe("dev routes", () => {
  it("don't exist when dev login is off", async () => {
    const app = buildServer({ inviteCode: TEST_INVITE_CODE, cookieSecure: false, devLogin: false });

    assert.equal((await app.inject({ method: "GET", url: "/api/dev/users" })).statusCode, 404);
    assert.equal((await app.inject({ method: "POST", url: "/api/dev/login-as", payload: { playerId: "x" } })).statusCode, 404);
  });

  it("list the accounts and log in as one without a password", async () => {
    const app = buildServer({ inviteCode: TEST_INVITE_CODE, cookieSecure: false, devLogin: true });
    const { user } = await signupUser("anna");
    await signupUser("bo");

    const users = (await app.inject({ method: "GET", url: "/api/dev/users" })).json();
    assert.deepEqual(users.map((u: { displayName: string }) => u.displayName), ["anna", "bo"]);

    const login = await app.inject({ method: "POST", url: "/api/dev/login-as", payload: { playerId: user.playerId } });
    assert.equal(login.statusCode, 200);
    const session = login.cookies.find((c) => c.name === "session")!.value;
    const me = await app.inject({ method: "GET", url: "/api/me", cookies: { session } });
    assert.equal(me.json().user.displayName, "anna");
  });

  it("404 for a player without an account", async () => {
    const app = buildServer({ inviteCode: TEST_INVITE_CODE, cookieSecure: false, devLogin: true });

    assert.equal((await app.inject({ method: "POST", url: "/api/dev/login-as", payload: { playerId: "nobody" } })).statusCode, 404);
  });
});
