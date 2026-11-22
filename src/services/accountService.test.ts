// Tests for deleting a web account: the account goes, the player stays anonymous so opponents' stats don't change.
// Fresh in-memory database for every test. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPlayer, getUserByEmail, openDatabase } from "../db.js";
import { signupUser, TEST_INVITE_CODE } from "../testHelpers.js";
import { deleteAccount, DELETED_PLAYER_NAME } from "./accountService.js";
import { getUserForSession, signup, type PublicUser } from "./authService.js";
import { confirmReport, listReports, reportResult } from "./reportService.js";
import { getLeaderboard, getPlayerMatches, getPlayerProfile } from "./statsService.js";
import { addPlayer, createTournament, getTournamentDetails } from "./tournamentService.js";

const PASSWORD = "correct horse"; // what signupUser uses

beforeEach(() => {
  openDatabase(":memory:");
});

// anna beats bo 3–0 in a confirmed, rated web match.
function annaBeatsBo(anna: PublicUser, bo: PublicUser): void {
  const reported = reportResult(anna, { opponentId: bo.playerId, format: "bo5", myGames: 3, opponentGames: 0 });
  assert.ok(reported.ok);
  confirmReport(bo, reported.report.id);
}

describe("deleteAccount", () => {
  it("refuses a wrong password and changes nothing", async () => {
    const { user: anna, sessionToken } = await signupUser("anna");

    assert.deepEqual(await deleteAccount(anna, "wrong password"), { ok: false, reason: "wrong-password" });
    assert.ok(getUserForSession(sessionToken));
  });

  it("deletes the account and its sessions, and frees the email for a new sign-up", async () => {
    const { user: anna, sessionToken } = await signupUser("anna");

    assert.deepEqual(await deleteAccount(anna, PASSWORD), { ok: true });

    assert.equal(getUserByEmail("anna@example.com"), undefined);
    assert.equal(getUserForSession(sessionToken), undefined);
    const again = await signup(
      { email: "anna@example.com", password: PASSWORD, displayName: "anna", inviteCode: TEST_INVITE_CODE },
      TEST_INVITE_CODE,
    );
    assert.ok(again.ok);
    assert.notEqual(again.user.playerId, anna.playerId); // a fresh player, not the old stats
  });

  it("keeps the player as 'Deleted player': opponents' history and rating don't change", async () => {
    const anna = (await signupUser("anna")).user;
    const bo = (await signupUser("bo")).user;
    annaBeatsBo(anna, bo);
    const boBefore = getPlayerProfile(bo.playerId)!;

    await deleteAccount(anna, PASSWORD);

    const player = getPlayer(anna.playerId)!;
    assert.equal(player.displayName, DELETED_PLAYER_NAME);
    assert.equal(player.avatarUrl, null);
    const boAfter = getPlayerProfile(bo.playerId)!;
    assert.equal(boAfter.rating, boBefore.rating);
    assert.equal(boAfter.losses, 1);
    assert.equal(getPlayerMatches(bo.playerId, { limit: 20 })!.matches[0]!.opponentName, DELETED_PLAYER_NAME);
  });

  it("hides them from the leaderboard, but their profile still loads (opponents link to it)", async () => {
    const anna = (await signupUser("anna")).user;
    const bo = (await signupUser("bo")).user;
    annaBeatsBo(anna, bo);

    await deleteAccount(anna, PASSWORD);

    assert.deepEqual(getLeaderboard().map((p) => p.id), [bo.playerId]);
    assert.equal(getPlayerProfile(anna.playerId)!.displayName, DELETED_PLAYER_NAME);
  });

  it("cancels pending reports they're part of", async () => {
    const anna = (await signupUser("anna")).user;
    const bo = (await signupUser("bo")).user;
    reportResult(bo, { opponentId: anna.playerId, format: "bo5", myGames: 3, opponentGames: 1 });

    await deleteAccount(anna, PASSWORD);

    assert.deepEqual(listReports(bo), { incoming: [], outgoing: [] });
  });

  it("deletes draft tournaments they organise and leaves drafts they joined", async () => {
    const anna = (await signupUser("anna")).user;
    const bo = (await signupUser("bo")).user;
    const annas = createTournament(anna, { name: "Anna's cup", matchFormat: "bo3", ranking: "wins" });
    const bos = createTournament(bo, { name: "Bo's cup", matchFormat: "bo3", ranking: "wins" });
    assert.ok(annas.ok && bos.ok);
    addPlayer(bo, bos.tournament.id, bo.playerId);
    addPlayer(bo, bos.tournament.id, anna.playerId);

    await deleteAccount(anna, PASSWORD);

    assert.equal(getTournamentDetails(annas.tournament.id), undefined);
    assert.deepEqual(getTournamentDetails(bos.tournament.id)!.players.map((p) => p.playerId), [bo.playerId]);
  });
});
