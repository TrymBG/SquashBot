// Deleting your own web account. The account (email, password hash, sessions, reset links) is deleted; the player
// stays as "Deleted player" so the opponents' match histories and ratings don't change (deleting matches would
// change everyone's ratings on replay and break played tournaments). Returns plain data like the other services.
import {
  anonymisePlayer,
  deleteDraftTournamentsOrganisedBy,
  deleteUser,
  getPendingReportsFor,
  getUserById,
  removePlayerFromDraftTournaments,
  resolveReport,
  transaction,
} from "../db.js";
import { verifyPassword } from "../passwords.js";
import type { PublicUser } from "./authService.js";
import { leaveAllGroups } from "./groupService.js";

export const DELETED_PLAYER_NAME = "Deleted player";

export type DeleteAccountResult = { ok: true } | { ok: false; reason: "wrong-password" };

// The password is asked again, so someone at an unlocked laptop can't delete the account with one click.
export async function deleteAccount(user: PublicUser, password: string, now = new Date()): Promise<DeleteAccountResult> {
  const account = getUserById(user.id);
  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    return { ok: false, reason: "wrong-password" };
  }
  const at = now.toISOString();

  transaction(() => {
    // Nobody could confirm or cancel these any more.
    for (const report of getPendingReportsFor(user.playerId)) {
      resolveReport(report.id, "cancelled", at, null);
    }
    // Nothing is played in a draft yet, so it can simply lose them. Active and finished tournaments keep them
    // (as "Deleted player"), because their schedule and results depend on them.
    deleteDraftTournamentsOrganisedBy(user.playerId);
    removePlayerFromDraftTournaments(user.playerId);
    leaveAllGroups(user.playerId); // owned groups go to the next member, or are deleted if empty
    anonymisePlayer(user.playerId, DELETED_PLAYER_NAME, at);
    deleteUser(user.id); // sessions and reset links go with it (ON DELETE CASCADE)
  });
  return { ok: true };
}
