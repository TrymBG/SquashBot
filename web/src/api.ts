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

// A website account (copy of PublicUser in the backend's authService.ts). Never includes the password.
export interface User {
  id: string
  email: string
  playerId: string
  displayName: string
}

// An HTTP error from the API, with its status, so a page can tell "not found" (404) from "server down".
// `message` is the server's `{ error }` text when there is one (e.g. "Wrong invite code"), so forms can show it.
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

// Sends a request and returns the parsed JSON body (undefined for 204 No Content).
// Throws ApiError on a non-2xx status, so TanStack Query shows it as an error.
// The session cookie is sent automatically: the page and the API share one origin (Vite proxies /api in dev).
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(body?.error ?? `${path} returned ${response.status}`, response.status)
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}

function getJson<T>(path: string): Promise<T> {
  return request(path)
}

function postJson<T>(path: string, body?: object): Promise<T> {
  return request(path, {
    method: 'POST',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
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

// Who is logged in, or null. A 401 just means "not logged in", so it isn't treated as an error.
export async function fetchMe(): Promise<User | null> {
  try {
    return (await getJson<{ user: User }>('/api/me')).user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export interface SignupInput {
  email: string
  password: string
  displayName: string
  inviteCode: string
}

export async function signup(input: SignupInput): Promise<User> {
  return (await postJson<{ user: User }>('/api/signup', input)).user
}

export async function login(input: { email: string; password: string }): Promise<User> {
  return (await postJson<{ user: User }>('/api/login', input)).user
}

export function logout(): Promise<void> {
  return postJson('/api/logout')
}

// A web player you can report a result against (copy of OpponentRow in the backend).
export interface Opponent {
  id: string
  displayName: string
  avatarUrl: string | null
  rating: number
}

// A reported result (copy of ReportRow in the backend). Scores are from the reporter's side.
export interface Report {
  id: number
  reporterId: string
  reporterName: string
  opponentId: string
  opponentName: string
  format: string
  reporterGames: number
  opponentGames: number
  playedAt: string
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled'
  createdAt: string
}

export interface ReportLists {
  incoming: Report[] // waiting for me to confirm
  outgoing: Report[] // waiting for my opponents
}

export interface ReportInput {
  opponentId: string
  format: string
  myGames: number
  opponentGames: number
  playedAt?: string // UTC ISO timestamp; left out = now
}

export function fetchOpponents(): Promise<Opponent[]> {
  return getJson('/api/opponents')
}

export function fetchReports(): Promise<ReportLists> {
  return getJson('/api/reports')
}

export async function createReport(input: ReportInput): Promise<Report> {
  return (await postJson<{ report: Report }>('/api/reports', input)).report
}

export function confirmReport(id: number): Promise<{ matchId: number }> {
  return postJson(`/api/reports/${id}/confirm`)
}

export function rejectReport(id: number): Promise<void> {
  return postJson(`/api/reports/${id}/reject`)
}

export function cancelReport(id: number): Promise<void> {
  return postJson(`/api/reports/${id}/cancel`)
}
