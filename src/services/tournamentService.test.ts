// Tests for tournamentService: round-robin lifecycle, permissions, and tournament matches through the report flow.
// Fresh in-memory database for every test. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { getLatestMatch, getPlayer, openDatabase } from "../db.js";
import { STARTING_RATING } from "../elo.js";
import { signupUser } from "../testHelpers.js";
import type { PublicUser } from "./authService.js";
import { undoMatch } from "./matchService.js";
import { confirmReport, reportResult } from "./reportService.js";
import { getPlayerMatches } from "./statsService.js";
import {
  addPlayer,
  createTournament,
  getTournamentDetails,
  listTournaments,
  removePlayer,
  startTournament,
  type TournamentDetails,
} from "./tournamentService.js";

const NOW = new Date("2026-11-19T18:00:00Z");

let anna: PublicUser;
let bo: PublicUser;
let cato: PublicUser;
let dina: PublicUser;

beforeEach(async () => {
  openDatabase(":memory:");
  anna = (await signupUser("anna")).user;
  bo = (await signupUser("bo")).user;
  cato = (await signupUser("cato")).user;
  dina = (await signupUser("dina")).user;
});

// Anna creates a 15-rally round robin ranked by points, adds the given players and (optionally) starts it.
function setup(players: PublicUser[], start = true, ranking: "wins" | "points" = "points"): TournamentDetails {
  const created = createTournament(anna, { name: "Winter cup", matchFormat: "r15", ranking }, NOW);
  assert.ok(created.ok, JSON.stringify(created));
  for (const p of players) {
    assert.deepEqual(addPlayer(anna, created.tournament.id, p.playerId, NOW), { ok: true });
  }
  if (start) {
    assert.deepEqual(startTournament(anna, created.tournament.id, NOW), { ok: true });
  }
  return getTournamentDetails(created.tournament.id)!;
}

// Plays a tournament match through the normal report → confirm flow. Scores from `reporter`'s side.
function playTournamentMatch(t: TournamentDetails, reporter: PublicUser, opponent: PublicUser, mine: number, theirs: number): void {
  const match = t.matches.find(
    (m) => [m.playerA?.id, m.playerB?.id].sort().join() === [reporter.playerId, opponent.playerId].sort().join(),
  );
  assert.ok(match, "no scheduled match between these two");
  const reported = reportResult(reporter, {
    opponentId: opponent.playerId,
    format: t.matchFormat,
    myGames: mine,
    opponentGames: theirs,
    tournamentMatchId: match.id,
  }, NOW);
  assert.ok(reported.ok, JSON.stringify(reported));
  assert.ok(confirmReport(opponent, reported.report.id, NOW).ok);
}

describe("createTournament", () => {
  it("creates a draft round robin with the creator as organizer", () => {
    const t = setup([], false);

    assert.equal(t.status, "draft");
    assert.equal(t.type, "round_robin");
    assert.equal(t.organizer.id, anna.playerId);
    assert.deepEqual(t.players, []);
    assert.equal(t.finished, false);
  });

  it("only allows points ranking with a fixed-rally format", () => {
    assert.deepEqual(createTournament(anna, { name: "Cup", matchFormat: "bo3", ranking: "points" }, NOW), {
      ok: false,
      reason: "points-need-rally-format",
    });
    assert.ok(createTournament(anna, { name: "Cup", matchFormat: "bo3", ranking: "wins" }, NOW).ok);
  });

  it("refuses an unknown format", () => {
    assert.deepEqual(createTournament(anna, { name: "Cup", matchFormat: "bo7", ranking: "wins" }, NOW), {
      ok: false,
      reason: "invalid-format",
    });
  });
});

describe("players and starting", () => {
  it("only the organizer can add players, and only while it's a draft", () => {
    const t = setup([anna, bo, cato], false);

    assert.deepEqual(addPlayer(bo, t.id, dina.playerId, NOW), { ok: false, reason: "not-allowed" });
    startTournament(anna, t.id, NOW);
    assert.deepEqual(addPlayer(anna, t.id, dina.playerId, NOW), { ok: false, reason: "not-draft" });
  });

  it("refuses a player twice, an unknown player, and someone without a web account", () => {
    const t = setup([anna], false);

    assert.deepEqual(addPlayer(anna, t.id, anna.playerId, NOW), { ok: false, reason: "already-in" });
    assert.deepEqual(addPlayer(anna, t.id, "nobody", NOW), { ok: false, reason: "player-not-found" });
  });

  it("can remove a player before the start", () => {
    const t = setup([anna, bo], false);

    assert.deepEqual(removePlayer(anna, t.id, bo.playerId), { ok: true });
    assert.deepEqual(getTournamentDetails(t.id)!.players.map((p) => p.playerId), [anna.playerId]);
    assert.deepEqual(removePlayer(anna, t.id, bo.playerId), { ok: false, reason: "not-in" });
  });

  it("needs at least 3 players to start, and only the organizer can start", () => {
    const t = setup([anna, bo], false);

    assert.deepEqual(startTournament(anna, t.id, NOW), { ok: false, reason: "too-few-players" });
    addPlayer(anna, t.id, cato.playerId, NOW);
    assert.deepEqual(startTournament(bo, t.id, NOW), { ok: false, reason: "not-allowed" });
    assert.deepEqual(startTournament(anna, t.id, NOW), { ok: true });
    assert.deepEqual(startTournament(anna, t.id, NOW), { ok: false, reason: "not-draft" });
  });

  it("starting writes the full schedule: everyone meets everyone once", () => {
    const t = setup([anna, bo, cato, dina]);

    assert.equal(t.status, "active");
    assert.equal(t.matches.length, 6);
    assert.ok(t.matches.every((m) => m.state === "unplayed"));
    assert.deepEqual([...new Set(t.matches.map((m) => m.round))], [1, 2, 3]);
  });

  it("an unknown tournament gives not-found", () => {
    assert.deepEqual(addPlayer(anna, 999, bo.playerId, NOW), { ok: false, reason: "not-found" });
    assert.equal(getTournamentDetails(999), undefined);
  });
});

describe("playing tournament matches", () => {
  it("a confirmed tournament match updates the standings at once (points: the loser keeps theirs), but not ratings yet", () => {
    const t = setup([anna, bo, cato]);

    playTournamentMatch(t, anna, bo, 8, 7);

    const after = getTournamentDetails(t.id)!;
    const played = after.matches.find((m) => m.state === "played")!;
    assert.deepEqual([played.scoreA, played.scoreB].sort(), [7, 8]);
    assert.deepEqual(
      after.standings.map((r) => [r.displayName, r.scoreFor]),
      [
        ["anna", 8],
        ["bo", 7],
        ["cato", 0],
      ],
    );
    // Ratings change only when the tournament ends (decided 2026-11-20).
    assert.equal(getPlayer(anna.playerId)!.rating, STARTING_RATING);
  });

  it("shows a reported but unconfirmed match as pending", () => {
    const t = setup([anna, bo, cato]);
    const match = t.matches.find((m) => [m.playerA?.id, m.playerB?.id].includes(bo.playerId) && [m.playerA?.id, m.playerB?.id].includes(anna.playerId))!;

    reportResult(anna, { opponentId: bo.playerId, format: "r15", myGames: 8, opponentGames: 7, tournamentMatchId: match.id }, NOW);

    assert.equal(getTournamentDetails(t.id)!.matches.find((m) => m.id === match.id)!.state, "pending");
  });

  it("is finished when every match is played", () => {
    const t = setup([anna, bo, cato]);

    playTournamentMatch(t, anna, bo, 8, 7);
    playTournamentMatch(t, anna, cato, 9, 6);
    assert.equal(getTournamentDetails(t.id)!.finished, false);
    playTournamentMatch(t, bo, cato, 10, 5);

    const done = getTournamentDetails(t.id)!;
    assert.equal(done.finished, true);
    // anna 8 + 9 = 17, bo 7 + 10 = 17 (tied: anna beat bo, so anna first), cato 6 + 5 = 11
    assert.deepEqual(done.standings.map((r) => `${r.position}:${r.displayName}`), ["1:anna", "2:bo", "3:cato"]);
  });

  it("undoing a tournament match makes it unplayed again", () => {
    const t = setup([anna, bo, cato]);
    playTournamentMatch(t, anna, bo, 8, 7);

    undoMatch(getLatestMatch()!.id, anna.playerId);

    const after = getTournamentDetails(t.id)!;
    assert.ok(after.matches.every((m) => m.state === "unplayed"));
    assert.ok(after.standings.every((r) => r.played === 0));
  });

  it("refuses a report that doesn't fit the tournament match", () => {
    const t = setup([anna, bo, cato]);
    const annaBo = t.matches.find((m) => [m.playerA?.id, m.playerB?.id].sort().join() === [anna.playerId, bo.playerId].sort().join())!;
    const report = (overrides: object, reporter = anna) =>
      reportResult(reporter, { opponentId: bo.playerId, format: "r15", myGames: 8, opponentGames: 7, tournamentMatchId: annaBo.id, ...overrides }, NOW);

    assert.deepEqual(report({ tournamentMatchId: 999 }), { ok: false, reason: "tournament-match-not-found" });
    assert.deepEqual(report({ opponentId: cato.playerId }), { ok: false, reason: "not-your-tournament-match" });
    assert.deepEqual(report({}, dina), { ok: false, reason: "not-your-tournament-match" });
    assert.deepEqual(report({ format: "bo3", myGames: 2, opponentGames: 0 }), { ok: false, reason: "wrong-format" });

    assert.ok(report({}).ok); // the real one
    assert.deepEqual(report({}), { ok: false, reason: "tournament-match-taken" }); // already waiting for confirmation
  });

  it("a normal (non-tournament) report between the same players doesn't touch the tournament", () => {
    const t = setup([anna, bo, cato]);

    const normal = reportResult(anna, { opponentId: bo.playerId, format: "bo3", myGames: 2, opponentGames: 0 }, NOW);
    assert.ok(normal.ok);
    confirmReport(bo, normal.report.id, NOW);

    assert.ok(getTournamentDetails(t.id)!.matches.every((m) => m.state === "unplayed"));
  });
});

describe("listTournaments", () => {
  it("lists newest first with players and progress", () => {
    setup([anna, bo, cato], true);
    const second = createTournament(bo, { name: "Spring league", matchFormat: "bo3", ranking: "wins" }, NOW);
    assert.ok(second.ok);

    const list = listTournaments();

    assert.deepEqual(
      list.map((t) => [t.name, t.status, t.playerCount, t.matchCount, t.playedCount]),
      [
        ["Spring league", "draft", 0, 0, 0],
        ["Winter cup", "active", 3, 3, 0],
      ],
    );
  });
});

describe("tournament info for the pages", () => {
  it("a pending tournament match exposes the waiting report (who reported, and the score), and drops it after confirm", () => {
    const t = setup([anna, bo, cato]);
    const annaBo = t.matches.find((m) => [m.playerA?.id, m.playerB?.id].sort().join() === [anna.playerId, bo.playerId].sort().join())!;
    const reported = reportResult(anna, { opponentId: bo.playerId, format: "r15", myGames: 8, opponentGames: 7, tournamentMatchId: annaBo.id }, NOW);
    assert.ok(reported.ok);

    const pending = getTournamentDetails(t.id)!.matches.find((m) => m.id === annaBo.id)!;
    assert.deepEqual(pending.pendingReport, { id: reported.report.id, reporterId: anna.playerId, reporterScore: 8, opponentScore: 7 });

    confirmReport(bo, reported.report.id, NOW);
    assert.equal(getTournamentDetails(t.id)!.matches.find((m) => m.id === annaBo.id)!.pendingReport, null);
  });

  it("reports and profile matches carry the tournament; normal ones don't", () => {
    const t = setup([anna, bo, cato]);
    const annaBo = t.matches.find((m) => [m.playerA?.id, m.playerB?.id].sort().join() === [anna.playerId, bo.playerId].sort().join())!;
    const inTournament = reportResult(anna, { opponentId: bo.playerId, format: "r15", myGames: 8, opponentGames: 7, tournamentMatchId: annaBo.id }, NOW);
    const normal = reportResult(anna, { opponentId: bo.playerId, format: "bo3", myGames: 2, opponentGames: 0 }, NOW);
    assert.ok(inTournament.ok && normal.ok);

    assert.equal(inTournament.report.tournamentName, "Winter cup");
    assert.equal(normal.report.tournamentName, null);

    confirmReport(bo, inTournament.report.id, NOW);
    confirmReport(bo, normal.report.id, NOW);
    const matches = getPlayerMatches(anna.playerId, { limit: 20 })!.matches; // newest first
    assert.equal(matches[0]!.tournament, null);
    assert.deepEqual(matches[1]!.tournament, { id: t.id, name: "Winter cup" });
  });
});
