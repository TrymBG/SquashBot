// Tests for the admin-made password reset links (createPasswordReset → resetPassword).
// Fresh in-memory database for every test. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../db.js";
import { signupUser } from "../testHelpers.js";
import { createPasswordReset, getUserForSession, login, RESET_LINK_MINUTES, resetPassword } from "./authService.js";

const NEW_PASSWORD = "a brand new one";

beforeEach(() => {
  openDatabase(":memory:");
});

describe("password reset links", () => {
  it("gives no link for an unknown email", () => {
    assert.equal(createPasswordReset("nobody@example.com"), undefined);
  });

  it("sets the new password, logs out everywhere else, and logs in with a new session", async () => {
    const { sessionToken: oldSession } = await signupUser("anna");
    const token = createPasswordReset("Anna@Example.com ")!; // same normalising as login

    const result = await resetPassword(token, NEW_PASSWORD);

    assert.ok(result.ok);
    assert.equal(result.user.displayName, "anna");
    assert.equal(getUserForSession(oldSession), undefined);
    assert.ok(getUserForSession(result.sessionToken));
    assert.equal((await login("anna@example.com", "correct horse")).ok, false);
    assert.equal((await login("anna@example.com", NEW_PASSWORD)).ok, true);
  });

  it("works only once", async () => {
    await signupUser("anna");
    const token = createPasswordReset("anna@example.com")!;

    assert.equal((await resetPassword(token, NEW_PASSWORD)).ok, true);
    assert.equal((await resetPassword(token, "another password")).ok, false);
  });

  it("expires after the time limit", async () => {
    await signupUser("anna");
    const made = new Date("2026-11-22T12:00:00Z");
    const token = createPasswordReset("anna@example.com", made)!;
    const justAfter = new Date(made.getTime() + RESET_LINK_MINUTES * 60 * 1000);

    assert.equal((await resetPassword(token, NEW_PASSWORD, justAfter)).ok, false);
  });

  it("a new link replaces the older one", async () => {
    await signupUser("anna");
    const first = createPasswordReset("anna@example.com")!;
    const second = createPasswordReset("anna@example.com")!;

    assert.equal((await resetPassword(first, NEW_PASSWORD)).ok, false);
    assert.equal((await resetPassword(second, NEW_PASSWORD)).ok, true);
  });

  it("rejects a made-up token", async () => {
    await signupUser("anna");

    assert.equal((await resetPassword("not-a-real-token", NEW_PASSWORD)).ok, false);
  });
});
