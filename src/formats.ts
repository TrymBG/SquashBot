// Every match format, in one place. Route schemas, validation and the Elo multipliers all use this list.
//   bo1 / bo3 / bo5   best of 1, 3 or 5 games
//   ft6               first to 6 games, win by 2
//   r11 / r15 / r21   fixed rallies: exactly that many points are played, the score is in points (e.g. 8–7)

export const MATCH_FORMATS = ["bo1", "bo3", "bo5", "ft6", "r11", "r15", "r21"] as const;

// "bo1" | "bo3" | … — a type made from the list above, so the two can't get out of sync.
export type MatchFormat = (typeof MATCH_FORMATS)[number];

export function isMatchFormat(value: string): value is MatchFormat {
  return (MATCH_FORMATS as readonly string[]).includes(value);
}

// The number of rallies for a fixed-rally format (r15 → 15), or null for a games format.
export function rallyLength(format: string): number | null {
  const match = /^r(\d+)$/.exec(format);
  return match && isMatchFormat(format) ? Number(match[1]) : null;
}
