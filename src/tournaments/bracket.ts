// Knockout bracket: lose once and you're out. Pure functions, no database (like elo.ts and schedule.ts).
//
// The bracket is a function of the seeds and the results, like ratings are a function of the matches (replayMatches):
// buildKnockout rebuilds who sits in every slot from scratch. The service re-runs it after every confirmed match and after
// an undo, so advancing winners, byes and the 3rd-place match all come from this one function.
//
//   round 1          round 2 (final)     A match at round r, position p feeds round r+1, position floor(p / 2):
//   s1 v s4 ──┐                          side A when p is even, side B when p is odd.
//             ├── winner v winner
//   s2 v s3 ──┘

export interface KnockoutSlot {
  round: number; // 1 = first round
  position: number; // index within the round, top to bottom
  playerA: string | null; // null = not decided yet
  playerB: string | null;
  thirdPlace: boolean; // the match for 3rd place (final round, position 1)
}

export interface KnockoutResult {
  winner: string;
  loser: string;
}

// The next power of two: 5 players play in an 8-bracket, 3 of them get a bye.
export function bracketSize(players: number): number {
  let size = 2;
  while (size < players) size *= 2;
  return size;
}

// Seed numbers in bracket order, top to bottom, so seeds 1 and 2 can only meet in the final, 1–4 in the semis, and so on.
// Doubling rule: start with [1, 2]; each time the bracket doubles, every seed s gets the new partner (size + 1 − s).
//   [1, 2] → [1, 4, 2, 3] → [1, 8, 4, 5, 2, 7, 3, 6]
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2;
    order = order.flatMap((seed) => [seed, next + 1 - seed]);
  }
  return order;
}

// Every match slot of the bracket. `seededIds[0]` is seed 1. `results` holds the played matches, keyed "round:position".
// Seeds above the player count are byes: the player without an opponent goes straight to round 2 (no match is created).
// Byes go to the top seeds, and with the order above two byes never meet.
export function buildKnockout(
  seededIds: string[],
  results: Map<string, KnockoutResult>,
  options: { thirdPlace: boolean },
): KnockoutSlot[] {
  if (seededIds.length < 2) {
    throw new Error("A knockout needs at least 2 players");
  }
  if (new Set(seededIds).size !== seededIds.length) {
    throw new Error("A player can't be in the bracket twice");
  }

  const size = bracketSize(seededIds.length);
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const slots: KnockoutSlot[] = [];
  const byeWinner = new Map<number, string>(); // round-1 position → the player who has a bye there

  // Who won the slot at (round, position): a bye player, the played match's winner, or nobody yet.
  const winnerOf = (round: number, position: number): string | null =>
    (round === 1 ? byeWinner.get(position) : undefined) ?? results.get(`${round}:${position}`)?.winner ?? null;
  const loserOf = (round: number, position: number): string | null => results.get(`${round}:${position}`)?.loser ?? null;

  for (let position = 0; position < size / 2; position++) {
    const playerA = seededIds[order[2 * position]! - 1] ?? null;
    const playerB = seededIds[order[2 * position + 1]! - 1] ?? null;
    if (playerA && playerB) {
      slots.push({ round: 1, position, playerA, playerB, thirdPlace: false });
    } else {
      byeWinner.set(position, (playerA ?? playerB)!);
    }
  }

  for (let round = 2; round <= rounds; round++) {
    const matchesInRound = size / 2 ** round;
    for (let position = 0; position < matchesInRound; position++) {
      slots.push({
        round,
        position,
        playerA: winnerOf(round - 1, 2 * position),
        playerB: winnerOf(round - 1, 2 * position + 1),
        thirdPlace: false,
      });
    }
  }

  // The two semifinal losers play for 3rd. Semifinals are the round before the final.
  if (options.thirdPlace && rounds >= 2) {
    slots.push({ round: rounds, position: 1, playerA: loserOf(rounds - 1, 0), playerB: loserOf(rounds - 1, 1), thirdPlace: true });
  }
  return slots;
}

// "Final", "Semifinals", "Quarterfinals", "Round of 16", counting back from the final; earlier rounds are numbered.
export function roundName(round: number, rounds: number): string {
  const fromEnd = rounds - round;
  return ["Final", "Semifinals", "Quarterfinals", "Round of 16"][fromEnd] ?? `Round ${round}`;
}
