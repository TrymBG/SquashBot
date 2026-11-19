// Round-robin standings: who's first. Pure function, no database (like elo.ts), so it's tested in isolation.
//
// Ranking "wins":   most match wins → head-to-head → score difference (scored − conceded)
// Ranking "points": most points scored (fixed-rally matches: the loser keeps their points) → head-to-head → most match wins
//
// Head-to-head looks only at the matches between the players who are tied: a mini-league. With two tied players
// that's just "who won their match"; with three or more it still works (count each one's wins against the others).
// Players still equal on everything share a position (1, 1, 3), in the order they were given.

export type Ranking = "wins" | "points";

// A played match, scores from playerA's side. For games formats the score is games (3–1), for rally formats points (8–7).
export interface PlayedMatch {
  playerA: string;
  playerB: string;
  scoreA: number;
  scoreB: number;
}

export interface StandingRow {
  playerId: string;
  position: number; // 1 = first; equal players share it
  played: number;
  wins: number;
  losses: number;
  scoreFor: number; // games or points won
  scoreAgainst: number; // games or points lost
}

export function roundRobinStandings(playerIds: string[], matches: PlayedMatch[], ranking: Ranking): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    playerIds.map((playerId) => [playerId, { playerId, position: 0, played: 0, wins: 0, losses: 0, scoreFor: 0, scoreAgainst: 0 }]),
  );
  for (const match of matches) {
    addResult(rows, match.playerA, match.scoreA, match.scoreB);
    addResult(rows, match.playerB, match.scoreB, match.scoreA);
  }

  const primary = (row: StandingRow) => (ranking === "wins" ? row.wins : row.scoreFor);
  const secondary = (row: StandingRow) => (ranking === "wins" ? row.scoreFor - row.scoreAgainst : row.wins);

  // Players with the same primary value form a tie group; head-to-head is counted inside each group.
  const headToHead = new Map<string, number>();
  for (const group of groupBy([...rows.values()], primary)) {
    const inGroup = new Set(group.map((row) => row.playerId));
    for (const row of group) {
      headToHead.set(row.playerId, winsAgainst(row.playerId, inGroup, matches));
    }
  }

  // The keys in order of importance. Array.sort is stable, so fully equal players keep the given order.
  const keys = (row: StandingRow) => [primary(row), headToHead.get(row.playerId) ?? 0, secondary(row)];
  const sorted = [...rows.values()].sort((a, b) => compareDescending(keys(a), keys(b)));

  // Same keys as the player above → same position; otherwise position = place in the list (1, 1, 3).
  sorted.forEach((row, index) => {
    const above = sorted[index - 1];
    row.position = above && compareDescending(keys(above), keys(row)) === 0 ? above.position : index + 1;
  });
  return sorted;
}

function addResult(rows: Map<string, StandingRow>, playerId: string, scored: number, conceded: number): void {
  const row = rows.get(playerId);
  if (!row) {
    throw new Error(`Match for a player who isn't in the tournament: ${playerId}`);
  }
  row.played++;
  row.scoreFor += scored;
  row.scoreAgainst += conceded;
  if (scored > conceded) row.wins++;
  else row.losses++;
}

// How many matches `playerId` won against players in `group` (the head-to-head mini-league).
function winsAgainst(playerId: string, group: Set<string>, matches: PlayedMatch[]): number {
  let wins = 0;
  for (const m of matches) {
    if (m.playerA === playerId && group.has(m.playerB) && m.scoreA > m.scoreB) wins++;
    if (m.playerB === playerId && group.has(m.playerA) && m.scoreB > m.scoreA) wins++;
  }
  return wins;
}

function groupBy<T>(items: T[], key: (item: T) => number): T[][] {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  }
  return [...groups.values()];
}

// Compares two key lists, bigger first: negative if `a` ranks higher, 0 if all keys are equal.
function compareDescending(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    const difference = (b[i] ?? 0) - (a[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
