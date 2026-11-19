// Tests for knockout tournaments in the service: seeding, byes, advancing winners, podium, 3rd place, undo.
// Fresh in-memory database for every test. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getLatestMatch, openDatabase, updatePlayerRating } from "../db.js";
import { signupUser } from "../testHelpers.js";
import type { PublicUser } from "./authService.js";
import { undoMatch } from "./matchService.js";
import { confirmReport, listReports, reportResult } from "./reportService.js";
import { addPlayer, createTournament, getTournamentDetails, startTournament, type TournamentDetails, type TournamentMatchView } from "./tournamentService.js";

const NOW = new Date("2026-11-20T18:00:00Z");
let users: PublicUser[]; // users[0] organizes

beforeEach(async () => {
  openDatabase(":memory:");
  users = [];
  for (const name of ["p1", "p2", "p3", "p4", "p5", "p6"]) {
    users.push((await signupUser(name)).user);
  }
});

// Ratings so seeding is predictable: p1 best (1600), p2 1500, …
function rateInOrder(count: number): void {
  users.slice(0, count).forEach((u, i) => updatePlayerRating(u.playerId, 1600 - i * 100));
}

function startKnockout(count: number, thirdPlace = false, joinOrder = users.slice(0, count)): TournamentDetails {
  const created = createTournament(users[0]!, { name: "Cup", matchFormat: "bo3", type: "knockout", thirdPlace }, NOW);
  assert.ok(created.ok);
  for (const u of joinOrder) addPlayer(users[0]!, created.tournament.id, u.playerId, NOW);
  assert.deepEqual(startTournament(users[0]!, created.tournament.id, NOW), { ok: true });
  return getTournamentDetails(created.tournament.id)!;
}

const userOf = (id: string) => users.find((u) => u.playerId === id)!;
const nameOf = (p: { displayName: string } | null) => p?.displayName ?? "TBD";
const at = (t: TournamentDetails, round: number, position: number) => t.matches.find((m) => m.round === round && m.position === position)!;

// Plays a bracket match: `winnerName` wins 2–0, reported by the winner, confirmed by the loser. Returns the new details.
function win(t: TournamentDetails, match: TournamentMatchView, winnerName: string): TournamentDetails {
  const winnerIsA = match.playerA!.displayName === winnerName;
  const winner = userOf((winnerIsA ? match.playerA : match.playerB)!.id);
  const loser = userOf((winnerIsA ? match.playerB : match.playerA)!.id);
  const reported = reportResult(winner, { opponentId: loser.playerId, format: "bo3", myGames: 2, opponentGames: 0, tournamentMatchId: match.id }, NOW);
  assert.ok(reported.ok, JSON.stringify(reported));
  assert.ok(confirmReport(loser, reported.report.id, NOW).ok);
  return getTournamentDetails(t.id)!;
}

describe("knockout: start", () => {
  it("seeds by rating, not by joining order, and pairs 1 v 4, 2 v 3", () => {
    rateInOrder(4);
    const t = startKnockout(4, false, [users[3]!, users[1]!, users[0]!, users[2]!]); // joined in a shuffled order

    assert.deepEqual(t.players.map((p) => [p.displayName, p.seed]).sort(), [["p1", 1], ["p2", 2], ["p3", 3], ["p4", 4]]);
    assert.deepEqual(
      t.matches.filter((m) => m.round === 1).map((m) => `${nameOf(m.playerA)} v ${nameOf(m.playerB)}`),
      ["p1 v p4", "p2 v p3"],
    );
    assert.deepEqual(t.rounds.map((r) => r.name), ["Semifinals", "Final"]);
    assert.equal(nameOf(at(t, 2, 0).playerA), "TBD");
  });

  it("6 players: the top 2 seeds get byes and already wait in the semifinals", () => {
    rateInOrder(6);
    const t = startKnockout(6);

    assert.deepEqual(
      t.matches.filter((m) => m.round === 1).map((m) => `${nameOf(m.playerA)} v ${nameOf(m.playerB)}`),
      ["p4 v p5", "p3 v p6"],
    );
    assert.deepEqual([nameOf(at(t, 2, 0).playerA), nameOf(at(t, 2, 1).playerA)], ["p1", "p2"]);
    assert.deepEqual(t.rounds.map((r) => r.name), ["Quarterfinals", "Semifinals", "Final"]);
  });

  it("needs at least 4 players", () => {
    const created = createTournament(users[0]!, { name: "Cup", matchFormat: "bo3", type: "knockout" }, NOW);
    assert.ok(created.ok);
    for (const u of users.slice(0, 3)) addPlayer(users[0]!, created.tournament.id, u.playerId, NOW);

    assert.deepEqual(startTournament(users[0]!, created.tournament.id, NOW), { ok: false, reason: "too-few-players" });
  });
});

describe("knockout: playing", () => {
  it("moves winners on, and the final decides the podium (semifinal losers share 3rd without a 3rd-place match)", () => {
    rateInOrder(4);
    let t = startKnockout(4);

    t = win(t, at(t, 1, 0), "p4"); // upset
    assert.deepEqual([nameOf(at(t, 2, 0).playerA), nameOf(at(t, 2, 0).playerB)], ["p4", "TBD"]);
    t = win(t, at(t, 1, 1), "p2");
    assert.equal(t.finished, false);
    t = win(t, at(t, 2, 0), "p2");

    assert.equal(t.finished, true);
    assert.equal(nameOf(t.podium!.first), "p2");
    assert.equal(nameOf(t.podium!.second), "p4");
    assert.deepEqual(t.podium!.third.map(nameOf).sort(), ["p1", "p3"]);
  });

  it("with a 3rd-place match, the semifinal losers play it and it must be played to finish", () => {
    rateInOrder(4);
    let t = startKnockout(4, true);
    t = win(t, at(t, 1, 0), "p1");
    t = win(t, at(t, 1, 1), "p3");

    const third = t.matches.find((m) => m.thirdPlace)!;
    assert.deepEqual([nameOf(third.playerA), nameOf(third.playerB)], ["p4", "p2"]);
    t = win(t, at(t, 2, 0), "p1");
    assert.equal(t.finished, false);
    t = win(t, third, "p2");

    assert.equal(t.finished, true);
    assert.deepEqual(t.podium!.third.map(nameOf), ["p2"]);
  });

  it("refuses a report for a match whose players aren't known yet", () => {
    rateInOrder(4);
    const t = startKnockout(4);
    const final = at(t, 2, 0);

    const result = reportResult(users[0]!, { opponentId: users[1]!.playerId, format: "bo3", myGames: 2, opponentGames: 0, tournamentMatchId: final.id }, NOW);

    assert.deepEqual(result, { ok: false, reason: "tournament-match-not-ready" });
  });

  it("undo (Discord) takes the winner out of the next round again and cancels a report waiting there", () => {
    rateInOrder(4);
    let t = startKnockout(4);
    t = win(t, at(t, 1, 0), "p1");
    t = win(t, at(t, 1, 1), "p2");
    // The final is reported but not confirmed yet…
    const final = at(t, 2, 0);
    reportResult(users[0]!, { opponentId: users[1]!.playerId, format: "bo3", myGames: 2, opponentGames: 1, tournamentMatchId: final.id }, NOW);

    // …then the last confirmed match (p2's semifinal) is undone.
    undoMatch(getLatestMatch()!.id, users[0]!.playerId);

    t = getTournamentDetails(t.id)!;
    assert.equal(at(t, 1, 1).state, "unplayed");
    assert.deepEqual([nameOf(at(t, 2, 0).playerA), nameOf(at(t, 2, 0).playerB)], ["p1", "TBD"]);
    assert.equal(at(t, 2, 0).state, "unplayed");
    assert.equal(listReports(users[1]!).incoming.length, 0, "the waiting final report was cancelled");
  });

  it("a round robin still works next to it (no podium, standings as before)", () => {
    const created = createTournament(users[0]!, { name: "League", matchFormat: "bo3", ranking: "wins" }, NOW);
    assert.ok(created.ok);
    for (const u of users.slice(0, 3)) addPlayer(users[0]!, created.tournament.id, u.playerId, NOW);
    startTournament(users[0]!, created.tournament.id, NOW);

    const t = getTournamentDetails(created.tournament.id)!;
    assert.equal(t.podium, null);
    assert.equal(t.standings.length, 3);
    assert.deepEqual(t.rounds.map((r) => r.name), ["Round 1", "Round 2", "Round 3"]);
  });
});

describe("old tournament tables", () => {
  it("refuses to start on a database with the old tournament_matches table, with a clear message", () => {
    const path = `/tmp/squash-old-schema-${process.pid}-${Date.now()}.db`;
    const old = new DatabaseSync(path);
    old.exec("CREATE TABLE tournament_matches (id INTEGER PRIMARY KEY, tournament_id INTEGER, round INTEGER, player_a TEXT NOT NULL, player_b TEXT NOT NULL)");
    old.close();

    try {
      assert.throws(() => openDatabase(path), /npm run seed/);
    } finally {
      for (const file of [path, `${path}-wal`, `${path}-shm`]) rmSync(file, { force: true }); // WAL mode adds the side files
    }
  });
});
