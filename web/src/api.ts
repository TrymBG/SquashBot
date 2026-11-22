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
  ratingChangeWeek: number // rating now minus 7 days ago
  opponents: OpponentRecord[] // everyone they've played, most played first
}

// One opponent and the player's record against them (copy of OpponentRecord in the backend's statsService.ts).
export interface OpponentRecord {
  id: string
  displayName: string
  avatarUrl: string | null
  played: number
  wins: number
  losses: number
}

// Optional filters for a player's match history. Missing = no filter.
export interface MatchFilters {
  opponent?: string
  format?: string
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
  ratingBefore: number | null // null: not rated (unranked, or its tournament hasn't finished)
  ratingAfter: number | null
  ranked: boolean // false = unranked: never changes ratings
  tournament: { id: number; name: string } | null // set when the match was part of a tournament
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

function deleteJson<T>(path: string): Promise<T> {
  return request(path, { method: 'DELETE' })
}

export function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  return getJson('/api/leaderboard')
}

export function fetchPlayerProfile(playerId: string): Promise<PlayerProfile> {
  return getJson(`/api/players/${encodeURIComponent(playerId)}`)
}

// One page of a player's matches. URLSearchParams builds the query string and escapes the values.
export function fetchPlayerMatches(playerId: string, filters: MatchFilters, before?: number): Promise<MatchPage> {
  const params = new URLSearchParams()
  if (before !== undefined) params.set('before', String(before))
  if (filters.opponent) params.set('opponent', filters.opponent)
  if (filters.format) params.set('format', filters.format)
  const query = params.size > 0 ? `?${params}` : ''
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

// Sets a new password with a one-time link from the admin; logs you in.
export async function resetPassword(input: { token: string; password: string }): Promise<User> {
  return (await postJson<{ user: User }>('/api/reset-password', input)).user
}

export function deleteAccount(password: string): Promise<void> {
  return postJson('/api/account/delete', { password })
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
  tournamentMatchId: number | null
  tournamentName: string | null // for the "🏆 Winter cup" label
  ranked: boolean // false = unranked: the opponent sees it before confirming
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
  tournamentMatchId?: number // a scheduled tournament match
  ranked?: boolean // default true; tournament matches follow the tournament
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

// ---- Tournaments (copies of the backend's tournamentService types) ----

export type TournamentRanking = 'wins' | 'points'

export interface TournamentSummary {
  id: number
  name: string
  type: 'round_robin' | 'knockout'
  matchFormat: string
  ranking: TournamentRanking | null // round robin only
  thirdPlace: boolean // knockout: a match for 3rd place
  ranked: boolean // false = its matches never change ratings
  status: 'draft' | 'active'
  organizerId: string
  organizerName: string
  createdAt: string
  startedAt: string | null
  playerCount: number
  matchCount: number
  playedCount: number
}

export interface TournamentPlayer {
  playerId: string
  displayName: string
  avatarUrl: string | null
  rating: number
  seed: number | null // knockout
}

export interface MatchPlayer {
  id: string
  displayName: string
  seed: number | null // knockout
}

export interface TournamentMatch {
  id: number
  round: number
  position: number
  playerA: MatchPlayer | null // null: knockout slot not decided yet
  playerB: MatchPlayer | null
  thirdPlace: boolean
  state: 'unplayed' | 'pending' | 'played'
  scoreA: number | null // from player A's side, once played
  scoreB: number | null
  pendingReport: { id: number; reporterId: string; reporterScore: number; opponentScore: number } | null
}

export interface StandingRow {
  playerId: string
  displayName: string
  position: number // equal players share it
  played: number
  wins: number
  losses: number
  scoreFor: number // games, or points for rally formats
  scoreAgainst: number
}

export interface TournamentDetails extends TournamentSummary {
  organizer: { id: string; displayName: string }
  finished: boolean
  players: TournamentPlayer[]
  matches: TournamentMatch[] // by round, then position
  rounds: { round: number; name: string }[] // "Round 1" or "Semifinals", "Final", …
  standings: StandingRow[] // round robin
  podium: { first: MatchPlayer | null; second: MatchPlayer | null; third: MatchPlayer[] } | null // knockout
}

export function fetchTournaments(): Promise<TournamentSummary[]> {
  return getJson('/api/tournaments')
}

export function fetchTournament(id: number): Promise<TournamentDetails> {
  return getJson(`/api/tournaments/${id}`)
}

export async function createTournament(input: {
  name: string
  matchFormat: string
  type: 'round_robin' | 'knockout'
  ranking?: TournamentRanking // round robin
  thirdPlace?: boolean // knockout
  ranked?: boolean // default true
}): Promise<TournamentDetails> {
  return (await postJson<{ tournament: TournamentDetails }>('/api/tournaments', input)).tournament
}

export function addTournamentPlayer(id: number, playerId: string): Promise<void> {
  return postJson(`/api/tournaments/${id}/players`, { playerId })
}

export function removeTournamentPlayer(id: number, playerId: string): Promise<void> {
  return deleteJson(`/api/tournaments/${id}/players/${encodeURIComponent(playerId)}`)
}

export function startTournament(id: number): Promise<void> {
  return postJson(`/api/tournaments/${id}/start`)
}

// ---- Dev only: "Log in as…" (the routes only exist when the API runs with DEV_LOGIN=1, never in production) ----

// The test accounts, or null when dev login is off (the route doesn't exist: 404).
export async function fetchDevUsers(): Promise<{ playerId: string; displayName: string }[] | null> {
  try {
    return await getJson('/api/dev/users')
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

export async function devLoginAs(playerId: string): Promise<User> {
  return (await postJson<{ user: User }>('/api/dev/login-as', { playerId })).user
}

// ---- Front page (copies of the backend's FeedMatchRow / OpenTournamentMatchRow) ----

export interface FeedPlayer {
  id: string
  displayName: string
  avatarUrl: string | null
}

export interface FeedMatch {
  matchId: number
  playedAt: string
  format: string
  winner: FeedPlayer
  loser: FeedPlayer
  winnerGames: number
  loserGames: number
  ranked: boolean
  winnerChange: number | null // null: not rated (unranked, or its tournament hasn't finished)
  loserChange: number | null
  tournament: { id: number; name: string } | null
}

export interface FeedPage {
  matches: FeedMatch[]
  nextBefore: number | null
}

export interface OpenTournamentMatch {
  tournamentMatchId: number
  tournamentId: number
  tournamentName: string
  matchFormat: string
  opponent: { id: string; displayName: string }
}

// Everyone's latest matches, newest first, one page at a time.
export function fetchRecentMatches(before?: number): Promise<FeedPage> {
  return getJson(`/api/matches${before === undefined ? '' : `?before=${before}`}`)
}

// My tournament matches that are ready to play (needs a login).
export function fetchMyTournamentMatches(): Promise<OpenTournamentMatch[]> {
  return getJson('/api/me/tournament-matches')
}
