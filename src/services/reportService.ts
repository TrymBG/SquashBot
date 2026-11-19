// Business logic for results reported on the website. A report is pending until the opponent confirms it;
// confirming records a real match with recordMatch, so ratings, history, undo and replay work exactly as for /result.
//
//   pending ──confirm (opponent)──> confirmed
//      ├────reject (opponent)─────> rejected
//      └────cancel (reporter)─────> cancelled
import {
  getPendingReportsFor,
  getPlayer,
  getPlayersWithAccounts,
  getReport,
  getTournament,
  getTournamentMatch,
  insertReport,
  playerHasAccount,
  resolveReport,
  setTournamentMatchResult,
  transaction,
  type OpponentRow,
  type ReportRow,
} from "../db.js";
import { isValidScore } from "../validation.js";
import type { PublicUser } from "./authService.js";
import { rateMatches, recordMatch } from "./matchService.js";
import { afterTournamentMatchResult, matchesToRateIfFinished } from "./tournamentService.js";

export type { OpponentRow, ReportRow };

const MAX_DAYS_BACK = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000; // allow a phone clock that's a few minutes ahead

export interface ReportInput {
  opponentId: string;
  format: string;
  myGames: number;
  opponentGames: number;
  playedAt?: string | undefined; // UTC ISO timestamp, default now
  tournamentMatchId?: number | undefined; // set when this is a scheduled tournament match
  ranked?: boolean | undefined; // default true; ignored for tournament matches (they follow the tournament)
}

export type ReportResult =
  | { ok: true; report: ReportRow }
  | {
      ok: false;
      reason:
        | "self"
        | "opponent-not-found"
        | "invalid-score"
        | "invalid-date"
        | "tournament-match-not-found"
        | "not-your-tournament-match" // you or the opponent isn't one of the two scheduled players
        | "wrong-format" // not the tournament's format
        | "tournament-match-taken" // already played, or a report for it is waiting for confirmation
        | "tournament-match-not-ready"; // knockout: the other player isn't known yet
    };

// Why changing a report failed. not-found also covers "exists, but you're not part of it", so outsiders can't
// learn which report ids exist.
export type ChangeFailure = { ok: false; reason: "not-found" | "not-allowed" | "not-pending" };

export type ConfirmResult = { ok: true; matchId: number } | ChangeFailure;

// Web players you can report a result against: everyone with an account except you.
export function listOpponents(user: PublicUser): OpponentRow[] {
  return getPlayersWithAccounts(user.playerId);
}

// Creates a pending report. Nothing about ratings changes until the opponent confirms.
export function reportResult(user: PublicUser, input: ReportInput, now = new Date()): ReportResult {
  if (input.opponentId === user.playerId) {
    return { ok: false, reason: "self" };
  }
  // A player without an account could never confirm, so they count as not found here.
  if (!getPlayer(input.opponentId) || !playerHasAccount(input.opponentId)) {
    return { ok: false, reason: "opponent-not-found" };
  }
  if (!isValidScore(input.format, input.myGames, input.opponentGames)) {
    return { ok: false, reason: "invalid-score" };
  }
  const playedAt = input.playedAt === undefined ? now : new Date(input.playedAt);
  const tooNew = playedAt.getTime() > now.getTime() + CLOCK_SKEW_MS;
  const tooOld = playedAt.getTime() < now.getTime() - MAX_DAYS_BACK * DAY_MS;
  if (Number.isNaN(playedAt.getTime()) || tooNew || tooOld) {
    return { ok: false, reason: "invalid-date" };
  }
  // A tournament match is ranked exactly when its tournament is; a normal one as the reporter chose.
  let ranked = input.ranked ?? true;
  if (input.tournamentMatchId !== undefined) {
    const problem = checkTournamentMatch(user, input);
    if (problem) return { ok: false, reason: problem };
    ranked = getTournament(getTournamentMatch(input.tournamentMatchId)!.tournamentId)!.ranked;
  }

  const id = insertReport(
    {
      reporterId: user.playerId,
      opponentId: input.opponentId,
      format: input.format,
      reporterGames: input.myGames,
      opponentGames: input.opponentGames,
      playedAt: playedAt.toISOString(),
      tournamentMatchId: input.tournamentMatchId ?? null,
      ranked,
    },
    now.toISOString(),
  );
  return { ok: true, report: getReport(id)! };
}

// Checks a report against its scheduled tournament match. Returns the problem, or null if it fits.
function checkTournamentMatch(
  user: PublicUser,
  input: ReportInput,
):
  | "tournament-match-not-found"
  | "not-your-tournament-match"
  | "wrong-format"
  | "tournament-match-taken"
  | "tournament-match-not-ready"
  | null {
  const match = input.tournamentMatchId === undefined ? undefined : getTournamentMatch(input.tournamentMatchId);
  const tournament = match && getTournament(match.tournamentId);
  if (!match || !tournament) return "tournament-match-not-found";
  if (match.playerA === null || match.playerB === null) return "tournament-match-not-ready";
  const scheduled = [match.playerA, match.playerB].sort().join();
  if (scheduled !== [user.playerId, input.opponentId].sort().join()) return "not-your-tournament-match";
  if (input.format !== tournament.matchFormat) return "wrong-format";
  if (match.matchId !== null || match.pendingReport !== null) return "tournament-match-taken";
  return null;
}

// My pending reports: `incoming` are waiting for me to confirm, `outgoing` are waiting for my opponents.
export function listReports(user: PublicUser): { incoming: ReportRow[]; outgoing: ReportRow[] } {
  const pending = getPendingReportsFor(user.playerId);
  return {
    incoming: pending.filter((r) => r.opponentId === user.playerId),
    outgoing: pending.filter((r) => r.reporterId === user.playerId),
  };
}

// The opponent confirms: record the match and mark the report confirmed, all in one transaction.
// recordMatch has its own transaction(); it joins this one (transaction() is reentrant), so a failure anywhere
// rolls back the match, the ratings and the status change together.
export function confirmReport(user: PublicUser, reportId: number, now = new Date()): ConfirmResult {
  return transaction((): ConfirmResult => {
    // Read inside the transaction, so two quick clicks can't both see "pending".
    const check = checkChange(user, reportId, "opponent");
    if (!check.ok) return check;
    const report = check.report;

    const { matchId } = recordMatch({
      reporterId: report.reporterId,
      reporterName: report.reporterName,
      reporterAvatarUrl: getPlayer(report.reporterId)?.avatarUrl ?? null,
      opponentId: report.opponentId,
      opponentName: report.opponentName,
      opponentAvatarUrl: getPlayer(report.opponentId)?.avatarUrl ?? null,
      format: report.format,
      reporterGames: report.reporterGames,
      opponentGames: report.opponentGames,
      playedAt: report.playedAt,
    }, {
      ranked: report.ranked,
      // Tournament matches count when the tournament ends (below), not one by one.
      rate: report.tournamentMatchId === null,
    });
    resolveReport(report.id, "confirmed", now.toISOString(), matchId);
    if (report.tournamentMatchId !== null) {
      // Same transaction: the tournament match is played exactly when the match exists.
      setTournamentMatchResult(report.tournamentMatchId, matchId);
      const tournamentId = afterTournamentMatchResult(report.tournamentMatchId, now); // knockout: the winner moves on
      // If that was the last match of a ranked tournament, all its matches are rated now, in the order they were played.
      if (tournamentId !== undefined) {
        rateMatches(matchesToRateIfFinished(tournamentId));
      }
    }
    return { ok: true, matchId };
  });
}

// The opponent says the report is wrong. Ratings never change.
export function rejectReport(user: PublicUser, reportId: number, now = new Date()): { ok: true } | ChangeFailure {
  return resolveWithoutMatch(user, reportId, "opponent", "rejected", now);
}

// The reporter withdraws it, e.g. after a typo in the score. Ratings never change.
export function cancelReport(user: PublicUser, reportId: number, now = new Date()): { ok: true } | ChangeFailure {
  return resolveWithoutMatch(user, reportId, "reporter", "cancelled", now);
}

function resolveWithoutMatch(
  user: PublicUser,
  reportId: number,
  role: "reporter" | "opponent",
  status: "rejected" | "cancelled",
  now: Date,
): { ok: true } | ChangeFailure {
  return transaction((): { ok: true } | ChangeFailure => {
    const check = checkChange(user, reportId, role);
    if (!check.ok) return check;
    resolveReport(reportId, status, now.toISOString(), null);
    return { ok: true };
  });
}

// Shared rules for confirm, reject and cancel: the report must exist, the user must be part of it
// in the right role, and it must still be pending.
function checkChange(user: PublicUser, reportId: number, role: "reporter" | "opponent"): { ok: true; report: ReportRow } | ChangeFailure {
  const report = getReport(reportId);
  const isReporter = report?.reporterId === user.playerId;
  const isOpponent = report?.opponentId === user.playerId;
  if (!report || (!isReporter && !isOpponent)) {
    return { ok: false, reason: "not-found" };
  }
  if ((role === "reporter" && !isReporter) || (role === "opponent" && !isOpponent)) {
    return { ok: false, reason: "not-allowed" };
  }
  if (report.status !== "pending") {
    return { ok: false, reason: "not-pending" };
  }
  return { ok: true, report };
}
