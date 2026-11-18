// Tests for reportService: reporting results on the website and the pending → confirmed/rejected/cancelled flow.
// Fresh in-memory database for every test. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPlayer, openDatabase, type ReportRow } from "../db.js";
import { STARTING_RATING } from "../elo.js";
import { play, signupUser } from "../testHelpers.js";
import type { PublicUser } from "./authService.js";
import {
  cancelReport,
  confirmReport,
  listOpponents,
  listReports,
  rejectReport,
  reportResult,
  type ReportInput,
} from "./reportService.js";
import { getPlayerMatches } from "./statsService.js";

const NOW = new Date("2026-11-18T18:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

let trym: PublicUser;
let ola: PublicUser;

beforeEach(async () => {
  openDatabase(":memory:");
  trym = (await signupUser("trym")).user;
  ola = (await signupUser("ola")).user;
});

function rating(user: PublicUser): number {
  return getPlayer(user.playerId)!.rating;
}

// trym reports "I beat ola 3-1 in bo5", unless overridden.
function report(overrides: Partial<ReportInput> = {}, reporter = trym): ReportRow {
  const result = reportResult(reporter, { opponentId: ola.playerId, format: "bo5", myGames: 3, opponentGames: 1, ...overrides }, NOW);
  assert.ok(result.ok, `expected report to succeed, got ${JSON.stringify(result)}`);
  return result.report;
}

describe("reportResult", () => {
  it("creates a pending report and doesn't change any rating yet", () => {
    const pending = report();

    assert.equal(pending.status, "pending");
    assert.equal(pending.reporterName, "trym");
    assert.equal(pending.opponentName, "ola");
    assert.equal(rating(trym), STARTING_RATING);
    assert.equal(rating(ola), STARTING_RATING);
  });

  it("uses the given date, or now when none is given", () => {
    const yesterday = new Date(NOW.getTime() - DAY_MS).toISOString();

    assert.equal(report({ playedAt: yesterday }).playedAt, yesterday);
    assert.equal(report().playedAt, NOW.toISOString());
  });

  it("refuses impossible scores, yourself, and unknown opponents", () => {
    const reject = (input: Partial<ReportInput>) =>
      reportResult(trym, { opponentId: ola.playerId, format: "bo5", myGames: 3, opponentGames: 1, ...input }, NOW);

    assert.deepEqual(reject({ myGames: 3, opponentGames: 3 }), { ok: false, reason: "invalid-score" });
    assert.deepEqual(reject({ format: "bo3", myGames: 3, opponentGames: 0 }), { ok: false, reason: "invalid-score" });
    assert.deepEqual(reject({ opponentId: trym.playerId }), { ok: false, reason: "self" });
    assert.deepEqual(reject({ opponentId: "nobody" }), { ok: false, reason: "opponent-not-found" });
  });

  it("refuses an opponent without a web account (they couldn't confirm)", () => {
    play("discord-kari", "discord-per", 3, 0); // Discord-only players

    const result = reportResult(trym, { opponentId: "discord-kari", format: "bo5", myGames: 3, opponentGames: 0 }, NOW);

    assert.deepEqual(result, { ok: false, reason: "opponent-not-found" });
  });

  it("refuses a date in the future or more than 30 days ago", () => {
    const reject = (playedAt: Date) =>
      reportResult(trym, { opponentId: ola.playerId, format: "bo5", myGames: 3, opponentGames: 1, playedAt: playedAt.toISOString() }, NOW);

    assert.deepEqual(reject(new Date(NOW.getTime() + 60 * 60 * 1000)), { ok: false, reason: "invalid-date" });
    assert.deepEqual(reject(new Date(NOW.getTime() - 31 * DAY_MS)), { ok: false, reason: "invalid-date" });
  });
});

describe("confirmReport", () => {
  it("records the match and changes ratings exactly like a direct recordMatch would", () => {
    const pending = report();

    const result = confirmReport(ola, pending.id, NOW);

    assert.ok(result.ok);
    const [match] = getPlayerMatches(trym.playerId, 20)!.matches;
    assert.equal(match!.matchId, result.matchId);
    assert.equal(match!.won, true);
    assert.equal(match!.myGames, 3);
    assert.equal(match!.opponentGames, 1);
    assert.equal(match!.playedAt, NOW.toISOString());

    // Same numbers as logging the same match directly in a fresh database.
    const confirmedRatings = [rating(trym), rating(ola)];
    openDatabase(":memory:");
    play("a", "b", 3, 1);
    assert.deepEqual(confirmedRatings, [getPlayer("a")!.rating, getPlayer("b")!.rating]);
  });

  it("only the opponent can confirm", () => {
    const pending = report();

    assert.deepEqual(confirmReport(trym, pending.id, NOW), { ok: false, reason: "not-allowed" });
    assert.equal(rating(trym), STARTING_RATING);
  });

  it("a report can be confirmed only once", () => {
    const pending = report();
    confirmReport(ola, pending.id, NOW);
    const afterFirst = rating(trym);

    assert.deepEqual(confirmReport(ola, pending.id, NOW), { ok: false, reason: "not-pending" });
    assert.equal(rating(trym), afterFirst);
  });

  it("someone outside the report gets not-found, as for a report that doesn't exist", async () => {
    const pending = report();
    const kari = (await signupUser("kari")).user;

    assert.deepEqual(confirmReport(kari, pending.id, NOW), { ok: false, reason: "not-found" });
    assert.deepEqual(confirmReport(ola, 9999, NOW), { ok: false, reason: "not-found" });
  });
});

describe("rejectReport and cancelReport", () => {
  it("the opponent can reject; ratings never change", () => {
    const pending = report();

    assert.deepEqual(rejectReport(trym, pending.id, NOW), { ok: false, reason: "not-allowed" });
    assert.deepEqual(rejectReport(ola, pending.id, NOW), { ok: true });
    assert.deepEqual(confirmReport(ola, pending.id, NOW), { ok: false, reason: "not-pending" });
    assert.equal(rating(trym), STARTING_RATING);
    assert.equal(getPlayerMatches(trym.playerId, 20)!.matches.length, 0);
  });

  it("the reporter can cancel while pending; the opponent can't", () => {
    const pending = report();

    assert.deepEqual(cancelReport(ola, pending.id, NOW), { ok: false, reason: "not-allowed" });
    assert.deepEqual(cancelReport(trym, pending.id, NOW), { ok: true });
    assert.deepEqual(confirmReport(ola, pending.id, NOW), { ok: false, reason: "not-pending" });
    assert.equal(rating(ola), STARTING_RATING);
  });
});

describe("listReports and listOpponents", () => {
  it("splits pending reports into incoming (to confirm) and outgoing (waiting on others)", () => {
    const mine = report(); // trym → ola
    const theirs = report({ opponentId: trym.playerId }, ola); // ola → trym
    const done = report();
    confirmReport(ola, done.id, NOW); // no longer pending

    const lists = listReports(trym);

    assert.deepEqual(lists.outgoing.map((r) => r.id), [mine.id]);
    assert.deepEqual(lists.incoming.map((r) => r.id), [theirs.id]);
  });

  it("lists other web players only, not yourself or Discord-only players", async () => {
    play("discord-kari", "discord-per", 3, 0);
    await signupUser("anna");

    assert.deepEqual(
      listOpponents(trym).map((p) => p.displayName),
      ["anna", "ola"],
    );
  });
});
