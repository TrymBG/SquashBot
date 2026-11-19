// Business logic for tournaments (round robin for now; knockout comes later). The organizer (whoever created it)
// adds players while it's a draft, then starts it: that writes the full schedule. Matches are played through the normal
// report → confirm flow (reportService), so they count for Elo like any match.
//
//   draft ──start (organizer, ≥ 3 players)──> active ──(every match played)──> finished (computed, not stored)
import {
  addTournamentPlayer,
  getPlayer,
  getTournament,
  getTournamentMatches,
  getTournamentPlayers,
  getTournaments,
  insertTournament,
  insertTournamentMatch,
  playerHasAccount,
  removeTournamentPlayer,
  setTournamentActive,
  transaction,
  type TournamentPlayerRow,
  type TournamentRanking,
  type TournamentRow,
} from "../db.js";
import { isMatchFormat, rallyLength } from "../formats.js";
import { roundRobinSchedule } from "../tournaments/schedule.js";
import { roundRobinStandings, type StandingRow } from "../tournaments/standings.js";
import type { PublicUser } from "./authService.js";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 16;

export type { TournamentPlayerRow, TournamentRow };

export interface TournamentMatchView {
  id: number;
  round: number;
  playerA: { id: string; displayName: string };
  playerB: { id: string; displayName: string };
  state: "unplayed" | "pending" | "played"; // pending = reported, waiting for the opponent to confirm
  scoreA: number | null; // from player A's side, once played
  scoreB: number | null;
}

export interface TournamentDetails extends TournamentRow {
  organizer: { id: string; displayName: string };
  finished: boolean;
  players: TournamentPlayerRow[];
  matches: TournamentMatchView[];
  standings: (StandingRow & { displayName: string })[];
}

export interface CreateInput {
  name: string;
  matchFormat: string;
  ranking: TournamentRanking;
}

export type CreateResult =
  | { ok: true; tournament: TournamentDetails }
  | { ok: false; reason: "invalid-format" | "points-need-rally-format" };

// Shared failures for changing a tournament. not-found also covers a tournament that doesn't exist at all.
export type ChangeResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not-found" | "not-allowed" | "not-draft" | "player-not-found" | "already-in" | "not-in" | "full" | "too-few-players";
    };

// Creates a draft round robin with the user as organizer. "points" ranking only makes sense when the score is in
// points, i.e. a fixed-rally format; with games formats it would just count games.
export function createTournament(user: PublicUser, input: CreateInput, now = new Date()): CreateResult {
  if (!isMatchFormat(input.matchFormat)) {
    return { ok: false, reason: "invalid-format" };
  }
  if (input.ranking === "points" && rallyLength(input.matchFormat) === null) {
    return { ok: false, reason: "points-need-rally-format" };
  }
  const id = insertTournament(
    {
      name: input.name.trim(),
      type: "round_robin",
      matchFormat: input.matchFormat,
      ranking: input.ranking,
      organizerId: user.playerId,
    },
    now.toISOString(),
  );
  return { ok: true, tournament: getTournamentDetails(id)! };
}

// Adds a player (organizer only, before the start). They need a web account, since they'll confirm results.
export function addPlayer(user: PublicUser, tournamentId: number, playerId: string, now = new Date()): ChangeResult {
  return transaction((): ChangeResult => {
    const check = checkDraftOrganizer(user, tournamentId);
    if (!check.ok) return check;
    if (!getPlayer(playerId) || !playerHasAccount(playerId)) {
      return { ok: false, reason: "player-not-found" };
    }
    const players = getTournamentPlayers(tournamentId);
    if (players.some((p) => p.playerId === playerId)) {
      return { ok: false, reason: "already-in" };
    }
    if (players.length >= MAX_PLAYERS) {
      return { ok: false, reason: "full" };
    }
    addTournamentPlayer(tournamentId, playerId, now.toISOString());
    return { ok: true };
  });
}

export function removePlayer(user: PublicUser, tournamentId: number, playerId: string): ChangeResult {
  return transaction((): ChangeResult => {
    const check = checkDraftOrganizer(user, tournamentId);
    if (!check.ok) return check;
    return removeTournamentPlayer(tournamentId, playerId) ? { ok: true } : { ok: false, reason: "not-in" };
  });
}

// Starts the tournament: writes every match of the schedule and locks the player list. All or nothing.
export function startTournament(user: PublicUser, tournamentId: number, now = new Date()): ChangeResult {
  return transaction((): ChangeResult => {
    const check = checkDraftOrganizer(user, tournamentId);
    if (!check.ok) return check;
    const players = getTournamentPlayers(tournamentId);
    if (players.length < MIN_PLAYERS) {
      return { ok: false, reason: "too-few-players" };
    }
    for (const match of roundRobinSchedule(players.map((p) => p.playerId))) {
      insertTournamentMatch(tournamentId, match.round, match.playerA, match.playerB);
    }
    setTournamentActive(tournamentId, now.toISOString());
    return { ok: true };
  });
}

// Everything the tournament page shows, or undefined if it doesn't exist.
export function getTournamentDetails(tournamentId: number): TournamentDetails | undefined {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    return undefined;
  }
  const players = getTournamentPlayers(tournamentId);
  const names = new Map(players.map((p) => [p.playerId, p.displayName]));
  const nameOf = (id: string) => names.get(id) ?? getPlayer(id)?.displayName ?? id;

  const matches: TournamentMatchView[] = getTournamentMatches(tournamentId).map((m) => ({
    id: m.id,
    round: m.round,
    playerA: { id: m.playerA, displayName: nameOf(m.playerA) },
    playerB: { id: m.playerB, displayName: nameOf(m.playerB) },
    state: m.matchId !== null ? "played" : m.pendingReportId !== null ? "pending" : "unplayed",
    scoreA: m.scoreA,
    scoreB: m.scoreB,
  }));

  const played = matches.flatMap((m) =>
    m.state === "played" ? [{ playerA: m.playerA.id, playerB: m.playerB.id, scoreA: m.scoreA!, scoreB: m.scoreB! }] : [],
  );
  const standings = roundRobinStandings(
    players.map((p) => p.playerId),
    played,
    tournament.ranking ?? "wins",
  ).map((row) => ({ ...row, displayName: nameOf(row.playerId) }));

  return {
    ...tournament,
    organizer: { id: tournament.organizerId, displayName: tournament.organizerName },
    finished: tournament.status === "active" && matches.length > 0 && played.length === matches.length,
    players,
    matches,
    standings,
  };
}

// Newest first, with player count and progress (for a tournament list page).
export function listTournaments(): TournamentRow[] {
  return getTournaments();
}

// Shared rules for changing a tournament before it starts: it exists, the user organizes it, it's still a draft.
function checkDraftOrganizer(user: PublicUser, tournamentId: number): ChangeResult {
  const tournament = getTournament(tournamentId);
  if (!tournament) return { ok: false, reason: "not-found" };
  if (tournament.organizerId !== user.playerId) return { ok: false, reason: "not-allowed" };
  if (tournament.status !== "draft") return { ok: false, reason: "not-draft" };
  return { ok: true };
}
