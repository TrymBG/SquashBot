// Tests for the production hardening in server.ts: security headers on every response, and 500 errors that never
// show internal details. Fresh in-memory database for every test.
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../db.js";
import { buildServer } from "./server.js";

beforeEach(() => {
  openDatabase(":memory:");
});

describe("security headers", () => {
  it("are on API answers, 404s and errors alike", async () => {
    const app = buildServer({ logger: false });
    for (const url of ["/api/leaderboard", "/api/nope", "/api/players/x/matches?limit=0"]) {
      const response = await app.inject({ method: "GET", url });
      assert.equal(response.headers["x-content-type-options"], "nosniff", url);
      assert.equal(response.headers["x-frame-options"], "DENY", url);
      assert.equal(response.headers["referrer-policy"], "strict-origin-when-cross-origin", url);
      assert.equal(response.headers["x-robots-tag"], "noindex, nofollow", url);
    }
  });

  it("include HSTS only in production (HTTPS cookies on)", async () => {
    const production = await buildServer({ logger: false, cookieSecure: true }).inject({ method: "GET", url: "/api/health" });
    const development = await buildServer({ logger: false, cookieSecure: false }).inject({ method: "GET", url: "/api/health" });

    assert.equal(production.headers["strict-transport-security"], "max-age=31536000");
    assert.equal(development.headers["strict-transport-security"], undefined);
  });
});

describe("error answers", () => {
  it("a crash gives 500 with a plain message, not the internal error text", async () => {
    const app = buildServer({ logger: false });
    app.get("/api/boom", () => {
      throw new Error("SQLITE_ERROR: no such column secret_stuff");
    });

    const response = await app.inject({ method: "GET", url: "/api/boom" });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), { error: "Something went wrong" });
    assert.doesNotMatch(response.body, /secret_stuff/);
  });

  it("a validation error (400) still explains what's wrong", async () => {
    const response = await buildServer({ logger: false }).inject({ method: "GET", url: "/api/matches?limit=0" });

    assert.equal(response.statusCode, 400);
    assert.match(response.json().message, /limit/);
  });
});
