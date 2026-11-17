// Tests for authService, against a fresh in-memory database for every test. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPlayer, openDatabase } from "../db.js";
import { STARTING_RATING } from "../elo.js";
import { getUserForSession, login, logout, SESSION_DAYS, signup, type SignupInput } from "./authService.js";

const INVITE = "squash2026";

function input(overrides: Partial<SignupInput> = {}): SignupInput {
  return { email: "trym@example.com", password: "correct horse", displayName: "Trym", inviteCode: INVITE, ...overrides };
}

beforeEach(() => {
  openDatabase(":memory:");
});

describe("signup", () => {
  it("creates a user, a player at the starting rating, and a session", async () => {
    const result = await signup(input(), INVITE);

    assert.ok(result.ok);
    assert.equal(result.user.email, "trym@example.com");
    assert.equal(result.user.displayName, "Trym");
    assert.equal(getPlayer(result.user.playerId)!.rating, STARTING_RATING);
    assert.deepEqual(getUserForSession(result.sessionToken), result.user);
  });

  it("never returns the password hash", async () => {
    const result = await signup(input(), INVITE);

    assert.ok(result.ok);
    assert.ok(!("passwordHash" in result.user));
  });

  it("stores the email trimmed and lowercase, and the name trimmed", async () => {
    const result = await signup(input({ email: "  Trym@Example.COM ", displayName: "  Trym  " }), INVITE);

    assert.ok(result.ok);
    assert.equal(result.user.email, "trym@example.com");
    assert.equal(result.user.displayName, "Trym");
  });

  it("refuses a wrong invite code", async () => {
    assert.deepEqual(await signup(input({ inviteCode: "guess" }), INVITE), { ok: false, reason: "invalid-invite" });
  });

  it("refuses everyone when sign-up is closed (no invite code configured)", async () => {
    assert.deepEqual(await signup(input(), null), { ok: false, reason: "signup-closed" });
  });

  it("refuses an email that is already registered, in any letter case", async () => {
    await signup(input(), INVITE);

    const second = await signup(input({ email: "TRYM@example.com", displayName: "Someone else" }), INVITE);

    assert.deepEqual(second, { ok: false, reason: "email-taken" });
  });
});

describe("login", () => {
  it("logs in with the right password, in any email letter case", async () => {
    const created = await signup(input(), INVITE);
    assert.ok(created.ok);

    const result = await login("TRYM@example.com", "correct horse");

    assert.ok(result.ok);
    assert.deepEqual(result.user, created.user);
    assert.deepEqual(getUserForSession(result.sessionToken), created.user);
  });

  it("gives the same failure for a wrong password and an unknown email", async () => {
    await signup(input(), INVITE);

    assert.deepEqual(await login("trym@example.com", "wrong password"), { ok: false });
    assert.deepEqual(await login("nobody@example.com", "correct horse"), { ok: false });
  });
});

describe("sessions", () => {
  it("logout ends the session", async () => {
    const result = await signup(input(), INVITE);
    assert.ok(result.ok);

    logout(result.sessionToken);

    assert.equal(getUserForSession(result.sessionToken), undefined);
  });

  it("an unknown or missing token gives no user", () => {
    assert.equal(getUserForSession("made-up-token"), undefined);
    assert.equal(getUserForSession(undefined), undefined);
  });

  it(`a session expires after ${SESSION_DAYS} days`, async () => {
    const start = new Date("2026-11-17T12:00:00Z");
    const result = await signup(input(), INVITE, start);
    assert.ok(result.ok);

    const justBefore = new Date(start.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000 - 1000);
    const justAfter = new Date(start.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000 + 1000);

    assert.deepEqual(getUserForSession(result.sessionToken, justBefore), result.user);
    assert.equal(getUserForSession(result.sessionToken, justAfter), undefined);
    // Expired sessions are deleted, so it stays gone even "back in time".
    assert.equal(getUserForSession(result.sessionToken, justBefore), undefined);
  });
});
