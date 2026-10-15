// Business logic for matches: recordMatch, undoLastMatch. Used by commands (and later the website API).
import { insertMatch, upsertPlayer } from "../db.js";

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

// Saves a reported match and returns its id.
export function recordMatch(report: MatchReport): number {
  upsertPlayer(report.reporterId, report.reporterName);
  upsertPlayer(report.opponentId, report.opponentName);

  const reporterWon = report.reporterGames > report.opponentGames;

  return insertMatch({
    winnerId: reporterWon ? report.reporterId : report.opponentId,
    loserId: reporterWon ? report.opponentId : report.reporterId,
    winnerGames: Math.max(report.reporterGames, report.opponentGames),
    loserGames: Math.min(report.reporterGames, report.opponentGames),
    format: report.format,
    reportedBy: report.reporterId,
    playedAt: new Date().toISOString(),
  });
}
