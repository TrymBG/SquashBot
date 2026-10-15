// Pure Elo math. No imports from Discord or the database, so it is easy to test.
// The rules are described in CLAUDE.md under "Rating rules". All numbers are starting values.

export const STARTING_RATING = 1000;

const NEW_PLAYER_K = 48;
const ESTABLISHED_K = 32;
const NEW_PLAYER_MATCHES = 10;
const MARGIN_WEIGHT = 0.2;

const FORMAT_MULTIPLIERS: Record<string, number> = {
  bo1: 0.5,
  bo3: 0.75,
  bo5: 1.0,
  ft6: 1.25,
};

// Probability (0..1) that a player beats the opponent, based on the rating gap.
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

// New players move faster until their rating has settled (FIDE-style).
export function baseK(matchesPlayed: number): number {
  return matchesPlayed < NEW_PLAYER_MATCHES ? NEW_PLAYER_K : ESTABLISHED_K;
}

export function formatMultiplier(format: string): number {
  const multiplier = FORMAT_MULTIPLIERS[format];
  if (multiplier === undefined) {
    throw new Error(`Unknown format: ${format}`);
  }
  return multiplier;
}

// 1.0 for the narrowest possible win, up to 1.2 for a whitewash (3-0, 6-0).
export function marginFactor(winnerGames: number, loserGames: number): number {
  return 1 + (MARGIN_WEIGHT * (winnerGames - loserGames)) / winnerGames;
}

export interface PlayerState {
  rating: number;
  matchesPlayed: number; // before this match
}

export interface MatchResult {
  format: string;
  winnerGames: number;
  loserGames: number;
}

export interface NewRatings {
  winnerRating: number;
  loserRating: number;
}

export function calculateNewRatings(winner: PlayerState, loser: PlayerState, match: MatchResult): NewRatings {
  const matchMultiplier = formatMultiplier(match.format) * marginFactor(match.winnerGames, match.loserGames);

  const winnerK = baseK(winner.matchesPlayed) * matchMultiplier;
  const loserK = baseK(loser.matchesPlayed) * matchMultiplier;

  const winnerExpected = expectedScore(winner.rating, loser.rating);
  const loserExpected = 1 - winnerExpected;

  return {
    winnerRating: winner.rating + winnerK * (1 - winnerExpected),
    loserRating: loser.rating + loserK * (0 - loserExpected),
  };
}
