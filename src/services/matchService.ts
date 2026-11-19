// Business logic for matches: recordMatch, undoMatch. Used by commands (and later the website API).
import {
  deleteAllRatingHistory,
  deleteMatch,
  getAllMatchesForReplay,
  getLatestMatch as queryLatestMatch,
  getMatchForRating,
  getPlayer,
  insertMatch,
  insertRatingHistory,
  nextRatingOrder,
  resetAllRatings,
  setRatingOrder,
  transaction,
  updatePlayerRating,
  upsertPlayer,
  type MatchRow,
  type PlayerRow,
} from "../db.js";
import { calculateNewRatings, replayMatches, STARTING_RATING } from "../elo.js";
import { syncAllKnockouts, unrateUnfinishedTournaments } from "./tournamentService.js";

export type { MatchRow };

// A match as the reporter sees it: "I played X and the score was my_games-their_games".
export interface MatchReport {
  reporterId: string;
  reporterName: string;
  reporterAvatarUrl: string | null;
  opponentId: string;
  opponentName: string;
  opponentAvatarUrl: string | null;
  format: string;
  reporterGames: number;
  opponentGames: number;
  playedAt?: string; // UTC ISO timestamp. Defaults to now; the seed script sets it to spread matches over time.
}

export interface RatingChange {
  playerId: string;
  before: number;
  after: number;
}

export interface RecordedMatch {
  matchId: number;
  rated: boolean; // false: recorded without a rating change (unranked, or a tournament that hasn't finished)
  winner: RatingChange; // before = after when not rated
  loser: RatingChange;
}

export interface RecordOptions {
  ranked?: boolean; // default true. false = unranked: recorded, never rated
  rate?: boolean; // default true. false = a ranked match rated later (tournament matches, when the tournament ends)
}

// Saves a reported match and, if it's rated now, updates both ratings. Returns the changes.
// Everything happens in one transaction, so a crash can never leave a match without its rating changes.
export function recordMatch(report: MatchReport, options: RecordOptions = {}): RecordedMatch {
  const ranked = options.ranked ?? true;
  const rateNow = ranked && (options.rate ?? true);
  return transaction(() => {
    upsertPlayer(report.reporterId, report.reporterName, report.reporterAvatarUrl, STARTING_RATING);
    upsertPlayer(report.opponentId, report.opponentName, report.opponentAvatarUrl, STARTING_RATING);

    const reporterWon = report.reporterGames > report.opponentGames;
    const winnerId = reporterWon ? report.reporterId : report.opponentId;
    const loserId = reporterWon ? report.opponentId : report.reporterId;
    const winnerGames = Math.max(report.reporterGames, report.opponentGames);
    const loserGames = Math.min(report.reporterGames, report.opponentGames);

    // Read ratings and match counts *before* inserting the new match.
    const winner = requirePlayer(winnerId);
    const loser = requirePlayer(loserId);

    const match = {
      winnerId,
      loserId,
      winnerGames,
      loserGames,
      format: report.format,
      reportedBy: report.reporterId,
      playedAt: report.playedAt ?? new Date().toISOString(),
      ranked,
    };

    if (!rateNow) {
      const matchId = insertMatch({ ...match, ratingOrder: null });
      return {
        matchId,
        rated: false,
        winner: { playerId: winnerId, before: winner.rating, after: winner.rating },
        loser: { playerId: loserId, before: loser.rating, after: loser.rating },
      };
    }

    const { winnerRating, loserRating } = calculateNewRatings(winner, loser, {
      format: report.format,
      winnerGames,
      loserGames,
    });
    // Rated now: the next place in the rating order (replays rate matches in this order).
    const matchId = insertMatch({ ...match, ratingOrder: nextRatingOrder() });

    insertRatingHistory(matchId, winnerId, winner.rating, winnerRating);
    insertRatingHistory(matchId, loserId, loser.rating, loserRating);
    updatePlayerRating(winnerId, winnerRating);
    updatePlayerRating(loserId, loserRating);

    return {
      matchId,
      rated: true,
      winner: { playerId: winnerId, before: winner.rating, after: winnerRating },
      loser: { playerId: loserId, before: loser.rating, after: loserRating },
    };
  });
}

// Rates matches that were recorded without a rating (a ranked tournament's matches, when it ends), in the given order,
// each from the players' ratings at that moment: the same math as recordMatch, just later. Each takes the next place in
// the rating order, so a replay rates them in the same order. Already rated or unranked matches are skipped.
export function rateMatches(matchIds: number[]): void {
  transaction(() => {
    for (const id of matchIds) {
      const match = getMatchForRating(id);
      if (!match || !match.ranked || match.ratingOrder !== null) continue;
      const winner = requirePlayer(match.winnerId);
      const loser = requirePlayer(match.loserId);
      const { winnerRating, loserRating } = calculateNewRatings(winner, loser, match);
      setRatingOrder(id, nextRatingOrder());
      insertRatingHistory(id, match.winnerId, winner.rating, winnerRating);
      insertRatingHistory(id, match.loserId, loser.rating, loserRating);
      updatePlayerRating(match.winnerId, winnerRating);
      updatePlayerRating(match.loserId, loserRating);
    }
  });
}

export function getLatestMatch(): MatchRow | undefined {
  return queryLatestMatch();
}

// Who may undo a match. For now anyone can; change this to e.g.
// `userId === match.winnerId || userId === match.loserId` to restrict it to the two players.
export function canUndo(_match: MatchRow, _userId: string): boolean {
  return true;
}

export type UndoResult = { ok: true; match: MatchRow } | { ok: false; reason: string };

// Removes the match, but only if it is still the most recent one, then recomputes every rating from scratch
// by replaying all remaining matches. rating_history and players.rating are rebuilt from the matches table.
export function undoMatch(matchId: number, requesterId: string): UndoResult {
  return transaction((): UndoResult => {
    const latest = queryLatestMatch();
    if (!latest || latest.id !== matchId) {
      return { ok: false, reason: "That match is no longer the most recent one (it may already have been undone)." };
    }
    if (!canUndo(latest, requesterId)) {
      return { ok: false, reason: "You are not allowed to undo this match." };
    }

    // Delete first, so the replay below no longer sees this match.
    deleteMatch(matchId);
    // A knockout winner leaves the next round again, and a tournament that's no longer finished has its matches
    // un-rated (they count again when it's finished). Both before the replay, which then rates what's left.
    syncAllKnockouts();
    unrateUnfinishedTournaments();
    const { history, players } = replayMatches(getAllMatchesForReplay());

    // Rebuild the history from the replay.
    deleteAllRatingHistory();
    for (const entry of history) {
      insertRatingHistory(entry.matchId, entry.playerId, entry.ratingBefore, entry.ratingAfter);
    }

    // Reset everyone first: a player with no matches left is not in `players`, and must go back to the start.
    resetAllRatings(STARTING_RATING);
    for (const [playerId, player] of players) {
      updatePlayerRating(playerId, player.rating);
    }

    return { ok: true, match: latest };
  });
}

function requirePlayer(id: string): PlayerRow {
  const player = getPlayer(id);
  if (!player) {
    throw new Error(`Player not found: ${id}`);
  }
  return player;
}
