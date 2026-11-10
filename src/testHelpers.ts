// Shared helpers for tests. Not a *.test.ts file, so `npm test` doesn't run it on its own.
import { recordMatch } from "./services/matchService.js";

// "reporter beat/lost to opponent myGames-theirGames in bo5", with the id doubling as the display name.
// Returns the new match's id.
export function play(reporterId: string, opponentId: string, myGames: number, theirGames: number): number {
  return recordMatch({
    reporterId,
    reporterName: reporterId,
    reporterAvatarUrl: null,
    opponentId,
    opponentName: opponentId,
    opponentAvatarUrl: null,
    format: "bo5",
    reporterGames: myGames,
    opponentGames: theirGames,
  }).matchId;
}
