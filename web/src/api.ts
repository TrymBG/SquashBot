// Calls to the bot's read-only API, and the shapes of its responses.
// These types are copies of the ones in src/services (the backend can't be imported here: it uses node:sqlite).
// Keep them in sync when an endpoint changes.

export interface LeaderboardRow {
  id: string
  displayName: string
  avatarUrl: string | null
  rating: number
  wins: number
  losses: number
}

// GET a JSON endpoint. Throws on a non-2xx status, so TanStack Query shows it as an error.
async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`)
  }
  return (await response.json()) as T
}

export function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  return getJson('/api/leaderboard')
}
