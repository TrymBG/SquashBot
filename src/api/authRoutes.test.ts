// Tests for the account endpoints, using `inject` with real cookies in and out. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { openDatabase } from "../db.js";
import { buildServer } from "./server.js";

const INVITE = "squash2026";
const TRYM = { email: "trym@example.com", password: "correct horse", displayName: "Trym", inviteCode: INVITE };

let app: FastifyInstance;

beforeEach(() => {
  openDatabase(":memory:");
  app = buildServer({ inviteCode: INVITE, cookieSecure: false });
});

function post(url: string, payload?: object, sessionCookie?: string) {
  return app.inject({
    method: "POST",
    url,
    ...(payload ? { payload } : {}),
    ...(sessionCookie ? { cookies: { session: sessionCookie } } : {}),
  });
}

function me(sessionCookie?: string) {
  return app.inject({ method: "GET", url: "/api/me", ...(sessionCookie ? { cookies: { session: sessionCookie } } : {}) });
}

// The value of the session cookie a response set.
function sessionFrom(response: Awaited<ReturnType<typeof post>>): string {
  const cookie = response.cookies.find((c) => c.name === "session");
  assert.ok(cookie, "expected a session cookie");
  return cookie.value;
}

describe("POST /api/signup", () => {
  it("creates the account and logs in with an httpOnly, SameSite=Lax cookie", async () => {
    const response = await post("/api/signup", TRYM);

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().user.displayName, "Trym");
    const cookie = response.cookies.find((c) => c.name === "session")!;
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, "Lax");
    assert.equal(cookie.path, "/");

    const who = await me(cookie.value);
    assert.equal(who.statusCode, 200);
    assert.equal(who.json().user.email, "trym@example.com");
  });

  it("never sends the password or its hash back", async () => {
    const response = await post("/api/signup", TRYM);

    assert.ok(!response.body.includes("correct horse"));
    assert.ok(!response.body.includes("scrypt"));
  });

  it("returns 403 for a wrong invite code and 409 for a taken email", async () => {
    assert.equal((await post("/api/signup", { ...TRYM, inviteCode: "guess" })).statusCode, 403);
    await post("/api/signup", TRYM);
    assert.equal((await post("/api/signup", TRYM)).statusCode, 409);
  });

  it("returns 403 when sign-up is closed", async () => {
    app = buildServer({ inviteCode: null, cookieSecure: false });

    assert.equal((await post("/api/signup", TRYM)).statusCode, 403);
  });

  it("rejects invalid input with 400", async () => {
    for (const bad of [
      { ...TRYM, email: "not-an-email" },
      { ...TRYM, password: "short" },
      { ...TRYM, displayName: "   " },
      { ...TRYM, displayName: "x".repeat(33) },
      { email: TRYM.email, password: TRYM.password }, // missing fields
    ]) {
      const response = await post("/api/signup", bad);
      assert.equal(response.statusCode, 400, JSON.stringify(bad));
    }
  });

  it("sets the Secure flag when configured for production", async () => {
    app = buildServer({ inviteCode: INVITE, cookieSecure: true });

    const response = await post("/api/signup", TRYM);

    assert.equal(response.cookies.find((c) => c.name === "session")!.secure, true);
  });
});

describe("POST /api/login", () => {
  it("logs in with the right password", async () => {
    await post("/api/signup", TRYM);

    const response = await post("/api/login", { email: TRYM.email, password: TRYM.password });

    assert.equal(response.statusCode, 200);
    assert.equal((await me(sessionFrom(response))).statusCode, 200);
  });

  it("returns the same 401 for a wrong password and an unknown email, and sets no cookie", async () => {
    await post("/api/signup", TRYM);

    const wrongPassword = await post("/api/login", { email: TRYM.email, password: "wrong password" });
    const unknownEmail = await post("/api/login", { email: "nobody@example.com", password: TRYM.password });

    assert.equal(wrongPassword.statusCode, 401);
    assert.equal(unknownEmail.statusCode, 401);
    assert.deepEqual(wrongPassword.json(), unknownEmail.json());
    assert.equal(wrongPassword.cookies.length, 0);
  });
});

describe("POST /api/logout and GET /api/me", () => {
  it("me is 401 without a cookie or with a made-up one", async () => {
    assert.equal((await me()).statusCode, 401);
    assert.equal((await me("made-up-token")).statusCode, 401);
  });

  it("logout ends the session and clears the cookie", async () => {
    const session = sessionFrom(await post("/api/signup", TRYM));

    const response = await post("/api/logout", undefined, session);

    assert.equal(response.statusCode, 204);
    const cleared = response.cookies.find((c) => c.name === "session")!;
    assert.equal(cleared.value, "");
    assert.equal((await me(session)).statusCode, 401); // the old token no longer works either
  });

  it("logout without a session is fine (204)", async () => {
    assert.equal((await post("/api/logout")).statusCode, 204);
  });
});

describe("a new account", () => {
  it("has a player profile at the starting rating", async () => {
    const { user } = (await post("/api/signup", TRYM)).json();

    const profile = await app.inject({ method: "GET", url: `/api/players/${user.playerId}` });

    assert.equal(profile.statusCode, 200);
    assert.equal(profile.json().rating, 1000);
    assert.equal(profile.json().position, null); // no matches yet
  });
});
