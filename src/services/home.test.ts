// Tests for what the front page needs: the activity feed, the weekly rating change, and your open tournament matches.
// Fresh in-memory database for every test. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../db.js";
import { play, signupUser } from "../testHelpers.js";
import type { PublicUser } from "./authService.js";
import { confirmReport, reportResult } from "./reportService.js";
import { getPlayerProfile, getRecentMatches } from "./statsService.js";
import { addPlayer, createTournament, getTournamentDetails, openMatchesFor, startTournament } from "./tournamentService.js";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  openDatabase(":memory:");
});

describe("getRecentMatches (activity feed)", () => {
  it("lists everyone's matches newest first, with both players and the rating change", () => {
    const first = play("trym", "ola", 3, 1);
    const second = play("kari", "trym", 3, 0);

    const { matches } = getRecentMatches({ limit: 20 });

    assert.deepEqual(matches.map((m) => m.matchId), [second, first]);
    const [newest] = matches;
    assert.equal(newest!.winner.displayName, "kari");
    assert.equal(newest!.loser.displayName, "trym");
    assert.deepEqual([newest!.winnerGames, newest!.loserGames], [3, 0]);
    assert.ok(newest!.winnerChange! > 0 && newest!.loserChange! < 0);
    assert.equal(newest!.ranked, true);
    assert.equal(newest!.tournament, null);
  });

  it("pages with a cursor until the end", () => {
    const ids = [1, 2, 3, 4, 5].map(() => play("trym", "ola", 3, 0));

    const page1 = getRecentMatches({ limit: 2 });
    const page2 = getRecentMatches({ limit: 2, before: page1.nextBefore! });
    const page3 = getRecentMatches({ limit: 2, before: page2.nextBefore! });

    assert.deepEqual([...page1.matches, ...page2.matches, ...page3.matches].map((m) => m.matchId), ids.reverse());
    assert.equal(page3.nextBefore, null);
  });

  it("shows unranked matches without a rating change", async () => {
    const anna = (await signupUser("anna")).user;
    const bo = (await signupUser("bo")).user;
    const reported = reportResult(anna, { opponentId: bo.playerId, format: "bo3", myGames: 2, opponentGames: 0, ranked: false });
    assert.ok(reported.ok);
    confirmReport(bo, reported.report.id);

    const [match] = getRecentMatches({ limit: 20 }).matches;

    assert.equal(match!.ranked, false);
    assert.equal(match!.winnerChange, null);
  });
});

describe("ratingChangeWeek", () => {
  it("is 0 for a player whose rating didn't move in the last 7 days", () => {
    play("trym", "ola", 3, 0);

    assert.equal(getPlayerProfile("trym", new Date(Date.now() + 8 * DAY_MS))!.ratingChangeWeek, 0);
  });

  it("is the change since 7 days ago", () => {
    play("trym", "ola", 3, 0);
    play("trym", "ola", 3, 0);
    const profile = getPlayerProfile("trym")!;

    // Both matches are inside the window, so the change is everything since the starting rating.
    assert.equal(profile.ratingChangeWeek, profile.rating - 1000);
  });
});

describe("openMatchesFor (your tournament matches)", () => {
  async function startedLeague(): Promise<{ users: PublicUser[]; id: number }> {
    const users = [(await signupUser("anna")).user, (await signupUser("bo")).user, (await signupUser("cato")).user];
    const created = createTournament(users[0]!, { name: "League", matchFormat: "bo3", ranking: "wins" });
    assert.ok(created.ok);
    for (const u of users) addPlayer(users[0]!, created.tournament.id, u.playerId);
    startTournament(users[0]!, created.tournament.id);
    return { users, id: created.tournament.id };
  }

  it("lists my unplayed matches in active tournaments, with opponent and format", async () => {
    const { users, id } = await startedLeague();

    const open = openMatchesFor(users[0]!.playerId);

    assert.equal(open.length, 2); // anna plays bo and cato
    assert.ok(open.every((m) => m.tournamentId === id && m.tournamentName === "League" && m.matchFormat === "bo3"));
    assert.deepEqual(open.map((m) => m.opponent.displayName).sort(), ["bo", "cato"]);
  });

  it("leaves out matches that are played or waiting for confirmation, and other people's", async () => {
    const { users, id } = await startedLeague();
    const [anna, bo, cato] = users as [PublicUser, PublicUser, PublicUser];
    const annaBo = getTournamentDetails(id)!.matches.find((m) => [m.playerA?.id, m.playerB?.id].sort().join() === [anna.playerId, bo.playerId].sort().join())!;
    reportResult(anna, { opponentId: bo.playerId, format: "bo3", myGames: 2, opponentGames: 0, tournamentMatchId: annaBo.id }); // pending

    assert.deepEqual(openMatchesFor(anna.playerId).map((m) => m.opponent.displayName), ["cato"]);
    assert.deepEqual(openMatchesFor(bo.playerId).map((m) => m.opponent.displayName), ["cato"]);
    assert.equal(openMatchesFor(cato.playerId).length, 2);
  });

  it("is empty for a draft tournament", async () => {
    const anna = (await signupUser("anna")).user;
    const created = createTournament(anna, { name: "Draft", matchFormat: "bo3", ranking: "wins" });
    assert.ok(created.ok);

    assert.deepEqual(openMatchesFor(anna.playerId), []);
  });
});
