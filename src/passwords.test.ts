// Tests for the password and session token helpers. Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, hashToken, newSessionToken, safeEqual, verifyPassword } from "./passwords.js";

describe("safeEqual", () => {
  it("compares strings of any length without throwing", () => {
    assert.equal(safeEqual("squash2026", "squash2026"), true);
    assert.equal(safeEqual("squash2026", "squash2025"), false);
    assert.equal(safeEqual("short", "a much longer string"), false);
    assert.equal(safeEqual("", ""), true);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("never stores the password itself", async () => {
    const stored = await hashPassword("correct horse battery");

    assert.ok(!stored.includes("correct horse battery"));
    assert.match(stored, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  });

  it("accepts the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery");

    assert.equal(await verifyPassword("correct horse battery", stored), true);
    assert.equal(await verifyPassword("correct horse batterY", stored), false);
  });

  it("gives the same password a different hash each time (random salt)", async () => {
    assert.notEqual(await hashPassword("same password"), await hashPassword("same password"));
  });

  it("rejects a stored value in the wrong format instead of throwing", async () => {
    assert.equal(await verifyPassword("anything", "not-a-hash"), false);
  });

  it("rejects a stored hash with an empty or broken key (would otherwise compare empty to empty)", async () => {
    assert.equal(await verifyPassword("anything", "scrypt$00ff$zz"), false);
    assert.equal(await verifyPassword("anything", "scrypt$00ff$"), false);
  });
});

describe("session tokens", () => {
  it("are random and long", () => {
    const a = newSessionToken();
    const b = newSessionToken();

    assert.notEqual(a, b);
    assert.ok(a.length >= 43); // 32 bytes in base64url
  });

  it("hash to the same value every time, but not to the token itself", () => {
    const token = newSessionToken();

    assert.equal(hashToken(token), hashToken(token));
    assert.notEqual(hashToken(token), token);
  });
});
