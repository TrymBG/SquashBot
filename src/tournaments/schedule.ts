// Round-robin schedule: everyone plays everyone once, spread over rounds so nobody plays twice in a round.
// Pure function, no database (like elo.ts), so it's tested in isolation.
//
// Circle method: put the players in two rows facing each other and pair them up. After each round, keep the first
// player still and rotate everyone else one step. After n − 1 rounds every pair has met exactly once.
// With an odd number of players, add an empty seat ("bye"): whoever faces it sits that round out.
//
//   round 1:  p1 p2 p3        round 2:  p1 p6 p2        (p1 stays, the others rotate)
//             p6 p5 p4                  p5 p4 p3

export interface ScheduledMatch {
  round: number; // 1, 2, …
  playerA: string;
  playerB: string;
}

export function roundRobinSchedule(playerIds: string[]): ScheduledMatch[] {
  if (playerIds.length < 2) {
    throw new Error("A round robin needs at least 2 players");
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("A player can't be in the schedule twice");
  }

  // null is the bye seat, only added for an odd number of players.
  const seats: (string | null)[] = playerIds.length % 2 === 0 ? [...playerIds] : [...playerIds, null];
  const half = seats.length / 2;
  const schedule: ScheduledMatch[] = [];

  for (let round = 1; round < seats.length; round++) {
    for (let i = 0; i < half; i++) {
      const playerA = seats[i];
      const playerB = seats[seats.length - 1 - i];
      if (playerA && playerB) {
        schedule.push({ round, playerA, playerB });
      }
    }
    // Keep seat 0, move the last seat to position 1 (everyone else shifts one step).
    seats.splice(1, 0, seats.pop()!);
  }
  return schedule;
}
