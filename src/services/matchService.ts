// Business logic for matches: recordMatch, undoLastMatch. Used by commands (and later the website API).
import {
  getPlayer,
  insertMatch,
  insertRatingHistory,
  transaction,
  updatePlayerRating,
  upsertPlayer,
  type PlayerRow,
} from "../db.js";
import { calculateNewRatings, STARTING_RATING } from "../elo.js";

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

function requirePlayer(id: string): PlayerRow {
  const player = getPlayer(id);
  if (!player) {
    throw new Error(`Player not found: ${id}`);
  }
  return player;
}
