// Every possible result for a match format, so the form can offer a list instead of free number fields.
// Same rules as the backend's validation.ts (which still checks every report):
// best of N: the winner reaches N/2 rounded up; first to 6: 6–0 … 6–4, then win by 2 (7–5, 8–6, …).

export interface ResultOption {
  label: string // "Won 3–1"
  myGames: number
  opponentGames: number
}

// First-to-6 can in theory go on forever (13–11, …). The list stops at 12–10, which covers real matches.
const FT6_MAX_WINNER_GAMES = 12

// Winning scores as [winnerGames, loserGames], closest results last.
function winningScores(format: string): [number, number][] {
  switch (format) {
    case 'bo1':
      return [[1, 0]]
    case 'bo3':
      return [[2, 0], [2, 1]]
    case 'bo5':
      return [[3, 0], [3, 1], [3, 2]]
    case 'ft6': {
      const scores: [number, number][] = [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4]]
      for (let winner = 7; winner <= FT6_MAX_WINNER_GAMES; winner++) {
        scores.push([winner, winner - 2])
      }
      return scores
    }
    default:
      return []
  }
}

// Wins first ("Won 3–0" … "Won 3–2"), then losses ("Lost 2–3" … "Lost 0–3"), each from my side.
export function validResults(format: string): ResultOption[] {
  const wins = winningScores(format).map(([winner, loser]) => ({
    label: `Won ${winner}–${loser}`,
    myGames: winner,
    opponentGames: loser,
  }))
  const losses = winningScores(format)
    .reverse()
    .map(([winner, loser]) => ({ label: `Lost ${loser}–${winner}`, myGames: loser, opponentGames: winner }))
  return [...wins, ...losses]
}
