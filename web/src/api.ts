// Calls to the bot's read-only API, and the shapes of its responses.
// These types are copies of the ones in src/services (the backend can't be imported here: it uses node:sqlite).
// Keep them in sync when an endpoint changes.

// Same as STARTING_RATING in the backend's elo.ts.
export const STARTING_RATING = 1000

export interface LeaderboardRow {
  id: string
  displayName: string
  avatarUrl: string | null
  rating: number
  wins: number
  losses: number
}

export type Result = 'W' | 'L'

export interface PlayerProfile {
  id: string
  displayName: string
  avatarUrl: string | null
  rating: number
  peakRating: number
  position: number | null // null with no matches
  rankedPlayers: number
  wins: number
  losses: number
  winRate: number | null // 0 to 1, null with no matches
  streak: { result: Result; count: number } | null
  recentForm: Result[] // newest first
  ratingHistory: { matchId: number; playedAt: string; rating: number }[] // oldest first
}

export interface PlayerMatch {
  matchId: number
  playedAt: string
  format: string
  opponentId: string
  opponentName: string
  opponentAvatarUrl: string | null
  won: boolean
  myGames: number
  opponentGames: number
  ratingBefore: number
  ratingAfter: number
}

export interface MatchPage {
  matches: PlayerMatch[]
  nextBefore: number | null // pass back as `before` for the next page, null on the last page
}

// An HTTP error from the API, with its status, so a page can tell "not found" (404) from "server down".
export class ApiError extends Error {
  readonly status: number

  constructor(path: string, status: number) {
    super(`${path} returned ${status}`)
    this.status = status
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

// GET a JSON endpoint. Throws ApiError on a non-2xx status, so TanStack Query shows it as an error.
async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new ApiError(path, response.status)
  }
  return (await response.json()) as T
}

export function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  return getJson('/api/leaderboard')
}

export function fetchPlayerProfile(playerId: string): Promise<PlayerProfile> {
  return getJson(`/api/players/${encodeURIComponent(playerId)}`)
}

export function fetchPlayerMatches(playerId: string, before?: number): Promise<MatchPage> {
  const query = before === undefined ? '' : `?before=${before}`
  return getJson(`/api/players/${encodeURIComponent(playerId)}/matches${query}`)
}
