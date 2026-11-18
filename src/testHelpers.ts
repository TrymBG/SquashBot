// Shared helpers for tests. Not a *.test.ts file, so `npm test` doesn't run it on its own.
import { signup, type PublicUser } from "./services/authService.js";
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

export const TEST_INVITE_CODE = "test-invite";

// Signs up a web user whose name, email and password are derived from `name`. Returns the user and a session token.
export async function signupUser(name: string): Promise<{ user: PublicUser; sessionToken: string }> {
  const result = await signup(
    { email: `${name}@example.com`, password: "correct horse", displayName: name, inviteCode: TEST_INVITE_CODE },
    TEST_INVITE_CODE,
  );
  if (!result.ok) {
    throw new Error(`signupUser(${name}) failed: ${result.reason}`);
  }
  return result;
}
