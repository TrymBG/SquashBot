// Business logic for matches: recordMatch, undoLastMatch. Used by commands (and later the website API).
import {
  deleteMatch,
  getLatestMatch as queryLatestMatch,
  getPlayer,
  getRatingsBefore,
  insertMatch,
  insertRatingHistory,
  transaction,
  updatePlayerRating,
  upsertPlayer,
  type MatchRow,
  type PlayerRow,
} from "../db.js";
import { calculateNewRatings, STARTING_RATING } from "../elo.js";

export type { MatchRow };

// A match as the reporter sees it: "I played X and the score was my_games-their_games".
export interface MatchReport {
  reporterId: string;
  reporterName: string;
  opponentId: string;
  opponentName: string;
  format: string;
  reporterGames: number;
  opponentGames: number;
}

export interface RatingChange {
  playerId: string;
  before: number;
  after: number;
}

export interface RecordedMatch {
  matchId: number;
  winner: RatingChange;
  loser: RatingChange;
}

// Saves a reported match, updates both ratings, and returns the changes.
// Everything happens in one transaction, so a crash can never leave a match without its rating changes.
export function recordMatch(report: MatchReport): RecordedMatch {
  return transaction(() => {
    upsertPlayer(report.reporterId, report.reporterName, STARTING_RATING);
    upsertPlayer(report.opponentId, report.opponentName, STARTING_RATING);

    const reporterWon = report.reporterGames > report.opponentGames;
    const winnerId = reporterWon ? report.reporterId : report.opponentId;
    const loserId = reporterWon ? report.opponentId : report.reporterId;
    const winnerGames = Math.max(report.reporterGames, report.opponentGames);
    const loserGames = Math.min(report.reporterGames, report.opponentGames);

    // Read ratings and match counts *before* inserting the new match.
    const winner = requirePlayer(winnerId);
    const loser = requirePlayer(loserId);

    const { winnerRating, loserRating } = calculateNewRatings(winner, loser, {
      format: report.format,
      winnerGames,
      loserGames,
    });

    const matchId = insertMatch({
      winnerId,
      loserId,
      winnerGames,
      loserGames,
      format: report.format,
      reportedBy: report.reporterId,
      playedAt: new Date().toISOString(),
    });

    insertRatingHistory(matchId, winnerId, winner.rating, winnerRating);
    insertRatingHistory(matchId, loserId, loser.rating, loserRating);
    updatePlayerRating(winnerId, winnerRating);
    updatePlayerRating(loserId, loserRating);

    return {
      matchId,
      winner: { playerId: winnerId, before: winner.rating, after: winnerRating },
      loser: { playerId: loserId, before: loser.rating, after: loserRating },
    };
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

// Removes the match and restores both players' ratings, but only if it is still the most recent match.
export function undoMatch(matchId: number, requesterId: string): UndoResult {
  return transaction((): UndoResult => {
    const latest = queryLatestMatch();
    if (!latest || latest.id !== matchId) {
      return { ok: false, reason: "That match is no longer the most recent one (it may already have been undone)." };
    }
    if (!canUndo(latest, requesterId)) {
      return { ok: false, reason: "You are not allowed to undo this match." };
    }

    for (const { playerId, ratingBefore } of getRatingsBefore(matchId)) {
      updatePlayerRating(playerId, ratingBefore);
    }
    deleteMatch(matchId);

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
