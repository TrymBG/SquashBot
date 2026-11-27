// Tests for groups: membership, invite links, owner rules, and the group's leaderboard (the overall ladder filtered to
// the members). Fresh in-memory database for every test. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../db.js";
import { signupUser } from "../testHelpers.js";
import { deleteAccount } from "./accountService.js";
import type { PublicUser } from "./authService.js";
import {
  createGroup,
  deleteGroup,
  getGroup,
  joinGroup,
  leaveGroup,
  listMyGroups,
  newInviteLink,
  previewInvite,
  removeMember,
} from "./groupService.js";
import { recordMatch } from "./matchService.js";
import { getLeaderboard } from "./statsService.js";

const NOW = new Date("2026-11-27T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

let anna: PublicUser, bo: PublicUser, cato: PublicUser;

beforeEach(async () => {
  openDatabase(":memory:");
  [anna, bo, cato] = [(await signupUser("anna")).user, (await signupUser("bo")).user, (await signupUser("cato")).user];
});

// winner beat loser 3–0, `daysAgo` days before NOW.
function beat(winner: PublicUser, loser: PublicUser, daysAgo = 1): void {
  recordMatch({
    reporterId: winner.playerId,
    reporterName: winner.displayName,
    reporterAvatarUrl: null,
    opponentId: loser.playerId,
    opponentName: loser.displayName,
    opponentAvatarUrl: null,
    format: "bo5",
    reporterGames: 3,
    opponentGames: 0,
    playedAt: new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString(),
  });
}

// anna creates "Tuesday crew"; the others join with the link if given.
function crewWith(...joiners: PublicUser[]): number {
  const group = createGroup(anna, "  Tuesday crew ");
  const code = getGroup(anna, group.id)!.inviteCode;
  for (const user of joiners) assert.ok(joinGroup(user, code).ok);
  return group.id;
}

describe("creating and joining", () => {
  it("makes the creator the owner, trims the name, and gives a 12-character invite code", () => {
    const id = crewWith();

    const group = getGroup(anna, id)!;
    assert.equal(group.name, "Tuesday crew");
    assert.equal(group.myRole, "owner");
    assert.match(group.inviteCode, /^[A-Za-z0-9_-]{12}$/);
    assert.deepEqual(listMyGroups(anna), [{ id, name: "Tuesday crew", memberCount: 1 }]);
  });

  it("joins with the link; joining twice keeps one membership", () => {
    const id = crewWith(bo, bo);

    assert.equal(getGroup(bo, id)!.memberCount, 2);
    assert.equal(getGroup(bo, id)!.myRole, "member");
  });

  it("refuses an unknown code, and shows a preview for a real one", () => {
    const id = crewWith();

    assert.deepEqual(joinGroup(bo, "nope-nope-no"), { ok: false, reason: "not-found" });
    assert.deepEqual(previewInvite(getGroup(anna, id)!.inviteCode), { id, name: "Tuesday crew", memberCount: 1 });
  });

  it("hides the group from non-members", () => {
    const id = crewWith();

    assert.equal(getGroup(bo, id), undefined);
    assert.deepEqual(listMyGroups(bo), []);
  });

  it("a new link stops the old one from working (owner only)", () => {
    const id = crewWith(bo);
    const old = getGroup(anna, id)!.inviteCode;

    assert.deepEqual(newInviteLink(bo, id), { ok: false, reason: "not-allowed" });
    const renewed = newInviteLink(anna, id);
    assert.ok(renewed.ok);
    assert.deepEqual(joinGroup(cato, old), { ok: false, reason: "not-found" });
    assert.ok(joinGroup(cato, renewed.inviteCode).ok);
  });
});

describe("the group's leaderboard", () => {
  it("shows only members, with movement counted within the group", () => {
    beat(cato, anna, 10); // cato plays too, but isn't in the group
    beat(anna, bo, 10); // a week ago, within the group: anna 1st, bo 2nd
    beat(bo, anna, 2); // this week bo passes anna
    beat(bo, anna, 1);
    const id = crewWith(bo); // anna and bo, not cato

    const ladder = getLeaderboard(NOW, id);

    assert.deepEqual(
      ladder.map((p) => [p.displayName, p.rankChange]),
      [
        ["bo", 1],
        ["anna", -1],
      ],
    );
    assert.ok(getLeaderboard(NOW).some((p) => p.id === cato.playerId)); // the overall ladder still has everyone
  });
});

describe("leaving, removing and deleting", () => {
  it("the owner removes a member, but not themselves; members can't remove anyone", () => {
    const id = crewWith(bo, cato);

    assert.deepEqual(removeMember(bo, id, cato.playerId), { ok: false, reason: "not-allowed" });
    assert.deepEqual(removeMember(anna, id, anna.playerId), { ok: false, reason: "cannot-remove-self" });
    assert.deepEqual(removeMember(anna, id, cato.playerId), { ok: true });
    assert.equal(getGroup(cato, id), undefined);
  });

  it("when the owner leaves, the longest-standing member becomes owner", () => {
    const id = crewWith(bo, cato);

    assert.deepEqual(leaveGroup(anna, id), { ok: true });

    assert.equal(getGroup(bo, id)!.myRole, "owner");
    assert.equal(getGroup(cato, id)!.myRole, "member");
  });

  it("the last member leaving deletes the group", () => {
    const id = crewWith(bo);
    const code = getGroup(anna, id)!.inviteCode;
    leaveGroup(bo, id);
    leaveGroup(anna, id);

    assert.equal(previewInvite(code), undefined);
    assert.deepEqual(listMyGroups(anna), []);
  });

  it("only the owner deletes the group", () => {
    const id = crewWith(bo);

    assert.deepEqual(deleteGroup(bo, id), { ok: false, reason: "not-allowed" });
    assert.deepEqual(deleteGroup(cato, id), { ok: false, reason: "not-found" });
    assert.deepEqual(deleteGroup(anna, id), { ok: true });
    assert.deepEqual(listMyGroups(bo), []);
  });

  it("deleting your account takes you out of every group and hands yours on", async () => {
    const id = crewWith(bo);

    assert.deepEqual(await deleteAccount(anna, "correct horse"), { ok: true });

    const group = getGroup(bo, id)!;
    assert.equal(group.myRole, "owner");
    assert.deepEqual(group.members.map((m) => m.displayName), ["bo"]);
  });
});
