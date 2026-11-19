// Tests for the rating rules "recorded vs rated": unranked matches and tournaments never change ratings, and ranked
// tournament matches are rated when the tournament ends. Fresh in-memory database for every test. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { rmSync } from "node:fs";
import { getLatestMatch, getPlayer, getRatingHistory, openDatabase } from "../db.js";
import { STARTING_RATING } from "../elo.js";
import { play, signupUser } from "../testHelpers.js";
import type { PublicUser } from "./authService.js";
import { recordMatch, undoMatch } from "./matchService.js";
import { confirmReport, reportResult, type ReportInput } from "./reportService.js";
import { getLeaderboard, getPlayerMatches, getPlayerProfile } from "./statsService.js";
import { addPlayer, createTournament, getTournamentDetails, startTournament, type TournamentDetails } from "./tournamentService.js";

const NOW = new Date("2026-11-20T18:00:00Z");
let anna: PublicUser;
let bo: PublicUser;
let cato: PublicUser;

beforeEach(async () => {
  openDatabase(":memory:");
  anna = (await signupUser("anna")).user;
  bo = (await signupUser("bo")).user;
  cato = (await signupUser("cato")).user;
});

const rating = (u: PublicUser) => getPlayer(u.playerId)!.rating;
const byId = (id: string) => [anna, bo, cato].find((u) => u.playerId === id)!;

// `reporter` beats `opponent` 2–0 in a bo3, reported and confirmed. Extra input (ranked, tournamentMatchId) as given.
function webMatch(reporter: PublicUser, opponent: PublicUser, extra: Partial<ReportInput> = {}): number {
  const reported = reportResult(reporter, { opponentId: opponent.playerId, format: "bo3", myGames: 2, opponentGames: 0, ...extra }, NOW);
  assert.ok(reported.ok, JSON.stringify(reported));
  const confirmed = confirmReport(opponent, reported.report.id, NOW);
  assert.ok(confirmed.ok);
  return confirmed.matchId;
}

// A started 3-player round robin (bo3, wins), ranked unless told otherwise.
function roundRobin(ranked = true): TournamentDetails {
  const created = createTournament(anna, { name: "League", matchFormat: "bo3", ranking: "wins", ranked }, NOW);
  assert.ok(created.ok);
  for (const u of [anna, bo, cato]) addPlayer(anna, created.tournament.id, u.playerId, NOW);
  startTournament(anna, created.tournament.id, NOW);
  return getTournamentDetails(created.tournament.id)!;
}

// Plays every match of the tournament in schedule order; player A wins each. Returns the ids of the recorded matches.
function playAll(t: TournamentDetails): number[] {
  return t.matches.map((m) => webMatch(byId(m.playerA!.id), byId(m.playerB!.id), { tournamentMatchId: m.id }));
}

describe("unranked matches", () => {
  it("never change ratings, but are in the profile's history and record", () => {
    webMatch(anna, bo, { ranked: false });

    assert.equal(rating(anna), STARTING_RATING);
    assert.equal(rating(bo), STARTING_RATING);
    assert.deepEqual(getRatingHistory(anna.playerId), []);

    const [match] = getPlayerMatches(anna.playerId, { limit: 20 })!.matches;
    assert.equal(match!.ranked, false);
    assert.equal(match!.ratingBefore, null);
    const profile = getPlayerProfile(anna.playerId)!;
    assert.equal(profile.wins, 1);
    assert.deepEqual(profile.ratingHistory, []);
  });

  it("don't count on the leaderboard: not in W–L, and only-unranked players aren't listed", () => {
    webMatch(anna, bo); // ranked
    webMatch(anna, cato, { ranked: false });

    const board = getLeaderboard();
    assert.deepEqual(board.map((r) => r.displayName).sort(), ["anna", "bo"]); // cato only played unranked
    assert.equal(board.find((r) => r.displayName === "anna")!.wins, 1);
  });

  it("don't count towards the K-factor's first 10 matches", () => {
    for (let i = 0; i < 10; i++) webMatch(anna, bo, { ranked: false });

    // anna still counts as new (K 48): her first rated match moves her as much as a brand-new player's would.
    webMatch(anna, cato);
    const annaRating = rating(anna); // read before switching to a fresh database below
    openDatabase(":memory:");
    play("x", "y", 2, 0, "bo3");
    assert.equal(annaRating, getPlayer("x")!.rating);
  });

  it("are left out of a replay (undo)", () => {
    webMatch(anna, bo);
    webMatch(anna, bo, { ranked: false });
    const before = rating(anna);
    webMatch(bo, cato); // latest, ranked

    undoMatch(getLatestMatch()!.id, anna.playerId);

    assert.equal(rating(anna), before);
  });
});

describe("tournament matches are rated when the tournament ends", () => {
  it("no rating changes while it runs; at the end, the same ratings as rating the matches one by one", () => {
    const t = roundRobin();
    const ids = playAll(t);

    // Finished: rated now. Compare with recording the same matches, in the same order, in a fresh database.
    const endRatings = [rating(anna), rating(bo), rating(cato)];
    assert.notDeepEqual(endRatings, [STARTING_RATING, STARTING_RATING, STARTING_RATING]);
    const matches = ids.map((id) => getPlayerMatches(anna.playerId, { limit: 50 })!.matches.find((m) => m.matchId === id));
    assert.ok(matches.length === 3);

    openDatabase(":memory:");
    for (const m of t.matches) {
      recordMatch({ reporterId: m.playerA!.id, reporterName: "a", reporterAvatarUrl: null, opponentId: m.playerB!.id, opponentName: "b", opponentAvatarUrl: null, format: "bo3", reporterGames: 2, opponentGames: 0 });
    }
    assert.deepEqual([getPlayer(anna.playerId)!.rating, getPlayer(bo.playerId)!.rating, getPlayer(cato.playerId)!.rating], endRatings);
  });

  it("keeps ratings still until the last match", () => {
    const t = roundRobin();
    webMatch(byId(t.matches[0]!.playerA!.id), byId(t.matches[0]!.playerB!.id), { tournamentMatchId: t.matches[0]!.id });
    webMatch(byId(t.matches[1]!.playerA!.id), byId(t.matches[1]!.playerB!.id), { tournamentMatchId: t.matches[1]!.id });

    assert.deepEqual([rating(anna), rating(bo), rating(cato)], [STARTING_RATING, STARTING_RATING, STARTING_RATING]);
    const pending = getPlayerMatches(anna.playerId, { limit: 20 })!.matches;
    assert.ok(pending.every((m) => m.ranked && m.ratingAfter === null), "ranked but not rated yet");
  });

  it("a normal match played during the tournament counts at once; the tournament counts after it", () => {
    const t = roundRobin();
    const [first, ...rest] = t.matches;
    webMatch(byId(first!.playerA!.id), byId(first!.playerB!.id), { tournamentMatchId: first!.id });
    webMatch(bo, cato); // normal, ranked: rated now
    const afterNormal = rating(bo);
    assert.notEqual(afterNormal, STARTING_RATING);
    for (const m of rest) webMatch(byId(m.playerA!.id), byId(m.playerB!.id), { tournamentMatchId: m.id });

    // The chart follows the rating order: bo's normal match first, then his tournament matches.
    const chart = getPlayerProfile(bo.playerId)!.ratingHistory;
    assert.equal(chart[0]!.rating, afterNormal);
    assert.equal(chart.at(-1)!.rating, rating(bo));
  });

  it("a replay (undo of a later match) gives the same ratings", () => {
    const t = roundRobin();
    playAll(t);
    const endRatings = [rating(anna), rating(bo), rating(cato)];
    webMatch(anna, bo); // a later normal match…

    undoMatch(getLatestMatch()!.id, anna.playerId); // …undone: full replay

    assert.deepEqual([rating(anna), rating(bo), rating(cato)], endRatings);
  });

  it("undoing the finishing match puts the tournament's other matches back to 'not rated yet'", () => {
    const t = roundRobin();
    playAll(t);

    undoMatch(getLatestMatch()!.id, anna.playerId);

    assert.deepEqual([rating(anna), rating(bo), rating(cato)], [STARTING_RATING, STARTING_RATING, STARTING_RATING]);
    assert.equal(getTournamentDetails(t.id)!.finished, false);
  });

  it("an unranked tournament never changes ratings, even when finished", () => {
    const t = roundRobin(false);
    playAll(t);

    assert.equal(getTournamentDetails(t.id)!.finished, true);
    assert.deepEqual([rating(anna), rating(bo), rating(cato)], [STARTING_RATING, STARTING_RATING, STARTING_RATING]);
  });
});

describe("migration", () => {
  it("an existing database gets rating_order = id, so ratings and replays stay the same", () => {
    const path = `/tmp/squash-rating-order-${process.pid}-${Date.now()}.db`;
    try {
      // Build a database, then drop the new columns' values the way an old database wouldn't have them:
      openDatabase(path);
      play("a", "b", 3, 0);
      play("b", "c", 3, 1);
      const raw = new DatabaseSync(path);
      raw.exec("ALTER TABLE matches DROP COLUMN rating_order");
      raw.close();

      openDatabase(path); // runs the migration

      const raw2 = new DatabaseSync(path);
      const rows = raw2.prepare("SELECT id, rating_order FROM matches ORDER BY id").all() as { id: number; rating_order: number }[];
      raw2.close();
      assert.ok(rows.every((r) => r.rating_order === r.id));
    } finally {
      for (const file of [path, `${path}-wal`, `${path}-shm`]) rmSync(file, { force: true });
    }
  });
});
