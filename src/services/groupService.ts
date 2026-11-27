// Business logic for groups. A group is a list of members with its own leaderboard: the overall ladder filtered to
// the members (everyone keeps one rating from all their matches, like a chess player's one rating across clubs).
// You join with the group's invite link; only members can see a group. One owner per group: they renew the link,
// remove members and delete the group. Returns plain data and typed results, like tournamentService.
import {
  deleteGroupMember,
  deleteGroupRow,
  getGroupById,
  getGroupByInviteCode,
  getGroupMembers,
  getGroupRole,
  getGroupsOf,
  insertGroup,
  insertGroupMember,
  setGroupInviteCode,
  setGroupRole,
  transaction,
  type GroupMemberRow,
  type GroupRole,
} from "../db.js";
import { newInviteCode } from "../passwords.js";
import type { PublicUser } from "./authService.js";

export const MAX_NAME_LENGTH = 40;

export interface GroupSummary {
  id: number;
  name: string;
  memberCount: number;
}

// What a member sees on the group page.
export interface GroupView extends GroupSummary {
  inviteCode: string;
  myRole: GroupRole;
  members: Omit<GroupMemberRow, "joinedAt">[];
}

export type GroupChangeResult = { ok: true } | { ok: false; reason: "not-found" | "not-allowed" | "not-member" | "cannot-remove-self" };

export function createGroup(user: PublicUser, name: string, now = new Date()): GroupSummary {
  const at = now.toISOString();
  return transaction(() => {
    const id = insertGroup(name.trim(), newInviteCode(), at);
    insertGroupMember(id, user.playerId, "owner", at);
    return { id, name: name.trim(), memberCount: 1 };
  });
}

// The group page, or undefined if it doesn't exist or you aren't a member (the route answers 404 for both, so
// outsiders can't even tell whether a group id exists).
export function getGroup(user: PublicUser, id: number): GroupView | undefined {
  const group = getGroupById(id);
  const myRole = group && getGroupRole(id, user.playerId);
  if (!group || !myRole) {
    return undefined;
  }
  return {
    id: group.id,
    name: group.name,
    memberCount: group.memberCount,
    inviteCode: group.inviteCode,
    myRole,
    members: getGroupMembers(id).map(({ joinedAt: _joinedAt, ...member }) => member),
  };
}

export function listMyGroups(user: PublicUser): GroupSummary[] {
  return getGroupsOf(user.playerId).map(({ id, name, memberCount }) => ({ id, name, memberCount }));
}

// True if the player is in the group (the leaderboard route checks this before showing the group's ladder).
export function isMember(user: PublicUser, id: number): boolean {
  return getGroupRole(id, user.playerId) !== undefined;
}

// For the join page: the group's name and size, for anyone who has the link.
export function previewInvite(code: string): GroupSummary | undefined {
  const group = getGroupByInviteCode(code);
  return group && { id: group.id, name: group.name, memberCount: group.memberCount };
}

// Joins the group behind an invite code. Already a member: nothing changes, still ok (clicking the link twice is fine).
export function joinGroup(user: PublicUser, code: string, now = new Date()): { ok: true; groupId: number } | { ok: false; reason: "not-found" } {
  const group = getGroupByInviteCode(code);
  if (!group) {
    return { ok: false, reason: "not-found" };
  }
  if (!getGroupRole(group.id, user.playerId)) {
    insertGroupMember(group.id, user.playerId, "member", now.toISOString());
  }
  return { ok: true, groupId: group.id };
}

// A new invite link (owner only). The old link stops working at once: use it if a link was shared too widely.
export function newInviteLink(user: PublicUser, id: number): { ok: true; inviteCode: string } | { ok: false; reason: "not-found" | "not-allowed" } {
  const check = ownerCheck(user, id);
  if (!check.ok) {
    return check;
  }
  const inviteCode = newInviteCode();
  setGroupInviteCode(id, inviteCode);
  return { ok: true, inviteCode };
}

// The owner removes a member. Not themselves: an owner leaves with leaveGroup, which hands the group on.
export function removeMember(user: PublicUser, id: number, playerId: string): GroupChangeResult {
  const check = ownerCheck(user, id);
  if (!check.ok) {
    return check;
  }
  if (playerId === user.playerId) {
    return { ok: false, reason: "cannot-remove-self" };
  }
  if (!getGroupRole(id, playerId)) {
    return { ok: false, reason: "not-member" };
  }
  deleteGroupMember(id, playerId);
  return { ok: true };
}

export function leaveGroup(user: PublicUser, id: number): GroupChangeResult {
  if (!getGroupRole(id, user.playerId)) {
    return { ok: false, reason: "not-found" };
  }
  leave(id, user.playerId);
  return { ok: true };
}

export function deleteGroup(user: PublicUser, id: number): GroupChangeResult {
  const check = ownerCheck(user, id);
  if (!check.ok) {
    return check;
  }
  deleteGroupRow(id);
  return { ok: true };
}

// When an account is deleted: the player leaves every group (owned groups are handed on, or deleted if empty).
export function leaveAllGroups(playerId: string): void {
  transaction(() => {
    for (const group of getGroupsOf(playerId)) {
      leave(group.id, playerId);
    }
  });
}

// One player leaves. If they were the owner, the longest-standing member takes over; if nobody is left, the group
// is deleted (a group without members would be unreachable).
function leave(groupId: number, playerId: string): void {
  transaction(() => {
    const wasOwner = getGroupRole(groupId, playerId) === "owner";
    deleteGroupMember(groupId, playerId);
    const remaining = getGroupMembers(groupId);
    if (remaining.length === 0) {
      deleteGroupRow(groupId);
    } else if (wasOwner) {
      setGroupRole(groupId, remaining[0]!.playerId, "owner");
    }
  });
}

// Owner-only actions: "not-found" for a missing group and for non-members (outsiders learn nothing), "not-allowed"
// for members who aren't the owner.
function ownerCheck(user: PublicUser, id: number): { ok: true } | { ok: false; reason: "not-found" | "not-allowed" } {
  const role = getGroupRole(id, user.playerId);
  if (!role) {
    return { ok: false, reason: "not-found" };
  }
  return role === "owner" ? { ok: true } : { ok: false, reason: "not-allowed" };
}
