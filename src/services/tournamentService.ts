// Business logic for tournaments: round robin and knockout. The organizer (whoever created it) adds players while it's
// a draft, then starts it: that writes every match slot. Matches are played through the normal report → confirm flow
// (reportService), so they count for Elo like any match.
//
//   draft ──start (organizer, enough players)──> active ──(every match played)──> finished (computed, not stored)
//
// Knockout: the bracket is a function of the seeds and the results (tournaments/bracket.ts). After every confirmed
// knockout match, and after an undo, syncKnockout re-runs it and writes the slots that changed.
import {
  addTournamentPlayer,
  getActiveKnockoutIds,
  getOpenTournamentMatches,
  getPlayer,
  getTournament,
  getTournamentMatch,
  getTournamentMatchIds,
  getTournamentMatches,
  getTournamentPlayers,
  getTournaments,
  insertTournament,
  insertTournamentMatch,
  playerHasAccount,
  removeTournamentPlayer,
  resolveReport,
  setRatingOrder,
  setTournamentActive,
  setTournamentMatchPlayers,
  setTournamentSeed,
  transaction,
  type OpenTournamentMatchRow,
  type TournamentMatchRow,
  type TournamentPlayerRow,
  type TournamentRanking,
  type TournamentRow,
  type TournamentType,
} from "../db.js";
import { isMatchFormat, rallyLength } from "../formats.js";
import { bracketSize, buildKnockout, roundName, type KnockoutResult } from "../tournaments/bracket.js";
import { roundRobinSchedule } from "../tournaments/schedule.js";
import { roundRobinStandings, type StandingRow } from "../tournaments/standings.js";
import type { PublicUser } from "./authService.js";

export const MAX_PLAYERS = 16;
// A knockout needs 4: with 3, one semifinal would be a bye and there'd be no real 3rd-place match.
export const MIN_PLAYERS: Record<TournamentType, number> = { round_robin: 3, knockout: 4 };

export type { TournamentPlayerRow, TournamentRow };

export interface MatchPlayer {
  id: string;
  displayName: string;
  seed: number | null; // knockout
}

export interface TournamentMatchView {
  id: number;
  round: number;
  position: number;
  playerA: MatchPlayer | null; // null: knockout slot not decided yet
  playerB: MatchPlayer | null;
  thirdPlace: boolean; // knockout: the match for 3rd place
  state: "unplayed" | "pending" | "played"; // pending = reported, waiting for the opponent to confirm
  scoreA: number | null; // from player A's side, once played
  scoreB: number | null;
  pendingReport: TournamentMatchRow["pendingReport"]; // the report waiting for confirmation, so the page can confirm it
}

export interface Podium {
  first: MatchPlayer | null;
  second: MatchPlayer | null;
  third: MatchPlayer[]; // the 3rd-place winner, or both semifinal losers when there's no 3rd-place match
}

export interface TournamentDetails extends TournamentRow {
  organizer: { id: string; displayName: string };
  finished: boolean;
  players: TournamentPlayerRow[];
  matches: TournamentMatchView[];
  rounds: { round: number; name: string }[];
  standings: (StandingRow & { displayName: string })[]; // round robin; empty for knockout
  podium: Podium | null; // knockout; null for round robin
}

export interface CreateInput {
  name: string;
  matchFormat: string;
  type?: TournamentType | undefined; // default round robin
  ranking?: TournamentRanking | undefined; // round robin, default "wins"
  thirdPlace?: boolean | undefined; // knockout, default false
  ranked?: boolean | undefined; // default true. false = its matches never change ratings
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

// Creates a draft tournament with the user as organizer. Round robin: "points" ranking only makes sense when the score
// is in points, i.e. a fixed-rally format. Knockout has no ranking (the bracket decides).
export function createTournament(user: PublicUser, input: CreateInput, now = new Date()): CreateResult {
  const type = input.type ?? "round_robin";
  const ranking = type === "round_robin" ? (input.ranking ?? "wins") : null;
  if (!isMatchFormat(input.matchFormat)) {
    return { ok: false, reason: "invalid-format" };
  }
  if (ranking === "points" && rallyLength(input.matchFormat) === null) {
    return { ok: false, reason: "points-need-rally-format" };
  }
  const id = insertTournament(
    {
      name: input.name.trim(),
      type,
      matchFormat: input.matchFormat,
      ranking,
      thirdPlace: type === "knockout" && (input.thirdPlace ?? false),
      ranked: input.ranked ?? true,
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

// Starts the tournament: writes every match slot and locks the player list. All or nothing.
// Round robin: the circle-method schedule. Knockout: seeds by rating (highest = 1; equal ratings keep joining order),
// then the whole bracket, later rounds still empty (byes already moved on).
export function startTournament(user: PublicUser, tournamentId: number, now = new Date()): ChangeResult {
  return transaction((): ChangeResult => {
    const check = checkDraftOrganizer(user, tournamentId);
    if (!check.ok) return check;
    const tournament = getTournament(tournamentId)!;
    const players = getTournamentPlayers(tournamentId);
    if (players.length < MIN_PLAYERS[tournament.type]) {
      return { ok: false, reason: "too-few-players" };
    }

    if (tournament.type === "round_robin") {
      const positionInRound = new Map<number, number>();
      for (const match of roundRobinSchedule(players.map((p) => p.playerId))) {
        const position = positionInRound.get(match.round) ?? 0;
        positionInRound.set(match.round, position + 1);
        insertTournamentMatch(tournamentId, match.round, position, match.playerA, match.playerB);
      }
    } else {
      // Array.sort is stable, so equal ratings keep the joining order.
      const seeded = [...players].sort((a, b) => b.rating - a.rating);
      seeded.forEach((p, index) => setTournamentSeed(tournamentId, p.playerId, index + 1));
      const slots = buildKnockout(
        seeded.map((p) => p.playerId),
        new Map(),
        { thirdPlace: tournament.thirdPlace },
      );
      for (const slot of slots) {
        insertTournamentMatch(tournamentId, slot.round, slot.position, slot.playerA, slot.playerB);
      }
    }
    setTournamentActive(tournamentId, now.toISOString());
    return { ok: true };
  });
}

// Called after a tournament match gets a result (reportService.confirmReport). Knockout: move the winner on.
// Returns the tournament's id, so the caller can rate it if this finished it.
export function afterTournamentMatchResult(tournamentMatchId: number, now = new Date()): number | undefined {
  const match = getTournamentMatch(tournamentMatchId);
  const tournament = match && getTournament(match.tournamentId);
  if (tournament?.type === "knockout") {
    syncKnockout(tournament.id, now);
  }
  return tournament?.id;
}

// Finished = started, and every match slot has a confirmed result.
export function isFinished(tournament: TournamentRow): boolean {
  return tournament.status === "active" && tournament.matchCount > 0 && tournament.playedCount === tournament.matchCount;
}

// The matches of a ranked tournament that are waiting to be rated (only when it's finished). Returns them oldest first,
// for matchService.rateMatches; empty while it's running, for an unranked tournament, or when they're already rated.
export function matchesToRateIfFinished(tournamentId: number): number[] {
  const tournament = getTournament(tournamentId);
  return tournament && tournament.ranked && isFinished(tournament) ? getTournamentMatchIds(tournamentId) : [];
}

// After an undo: a ranked tournament that's no longer finished counts again only when it's finished, so its matches
// lose their place in the rating order. The replay after this then leaves them out.
export function unrateUnfinishedTournaments(): void {
  for (const tournament of getTournaments()) {
    if (tournament.ranked && !isFinished(tournament)) {
      for (const matchId of getTournamentMatchIds(tournament.id)) {
        setRatingOrder(matchId, null);
      }
    }
  }
}

// Called after an undo (matchService.undoMatch): an undone knockout match empties the slot its winner had moved to.
export function syncAllKnockouts(now = new Date()): void {
  for (const id of getActiveKnockoutIds()) {
    syncKnockout(id, now);
  }
}

// Rebuilds the bracket from the seeds and the played results, and writes every slot whose players changed.
// If such a slot had a report waiting for confirmation, that report no longer fits and is cancelled.
// A played slot never changes (only the newest match can be undone, and nothing after it is played yet).
export function syncKnockout(tournamentId: number, now = new Date()): void {
  transaction(() => {
    const tournament = getTournament(tournamentId);
    if (!tournament || tournament.type !== "knockout" || tournament.status !== "active") return;

    const seeded = getTournamentPlayers(tournamentId)
      .filter((p) => p.seed !== null)
      .sort((a, b) => a.seed! - b.seed!)
      .map((p) => p.playerId);
    const rows = getTournamentMatches(tournamentId);
    const results = new Map<string, KnockoutResult>();
    for (const row of rows) {
      if (row.matchId !== null && row.playerA && row.playerB) {
        const aWon = row.scoreA! > row.scoreB!;
        results.set(`${row.round}:${row.position}`, {
          winner: aWon ? row.playerA : row.playerB,
          loser: aWon ? row.playerB : row.playerA,
        });
      }
    }

    for (const slot of buildKnockout(seeded, results, { thirdPlace: tournament.thirdPlace })) {
      const row = rows.find((r) => r.round === slot.round && r.position === slot.position);
      if (!row || row.matchId !== null) continue;
      if (row.playerA === slot.playerA && row.playerB === slot.playerB) continue;
      setTournamentMatchPlayers(row.id, slot.playerA, slot.playerB);
      if (row.pendingReport) {
        resolveReport(row.pendingReport.id, "cancelled", now.toISOString(), null);
      }
    }
  });
}

// Everything the tournament page shows, or undefined if it doesn't exist.
export function getTournamentDetails(tournamentId: number): TournamentDetails | undefined {
  const tournament = getTournament(tournamentId);
  if (!tournament) {
    return undefined;
  }
  const players = getTournamentPlayers(tournamentId);
  const byId = new Map(players.map((p) => [p.playerId, p]));
  const player = (id: string | null): MatchPlayer | null =>
    id === null
      ? null
      : { id, displayName: byId.get(id)?.displayName ?? getPlayer(id)?.displayName ?? id, seed: byId.get(id)?.seed ?? null };

  const isKnockout = tournament.type === "knockout";
  const rows = getTournamentMatches(tournamentId);
  const lastRound = Math.max(0, ...rows.map((m) => m.round));
  const matches: TournamentMatchView[] = rows.map((m) => ({
    id: m.id,
    round: m.round,
    position: m.position,
    playerA: player(m.playerA),
    playerB: player(m.playerB),
    thirdPlace: isKnockout && m.round === lastRound && m.position === 1,
    state: m.matchId !== null ? "played" : m.pendingReport !== null ? "pending" : "unplayed",
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    pendingReport: m.pendingReport,
  }));

  const roundNumbers = [...new Set(matches.map((m) => m.round))];
  const rounds = roundNumbers.map((round) => ({
    round,
    name: isKnockout ? roundName(round, Math.log2(bracketSize(players.length))) : `Round ${round}`,
  }));

  const played = matches.filter((m) => m.state === "played");
  const standings = isKnockout
    ? []
    : roundRobinStandings(
        players.map((p) => p.playerId),
        played.map((m) => ({ playerA: m.playerA!.id, playerB: m.playerB!.id, scoreA: m.scoreA!, scoreB: m.scoreB! })),
        tournament.ranking ?? "wins",
      ).map((row) => ({ ...row, displayName: player(row.playerId)!.displayName }));

  return {
    ...tournament,
    organizer: { id: tournament.organizerId, displayName: tournament.organizerName },
    finished: tournament.status === "active" && matches.length > 0 && played.length === matches.length,
    players,
    matches,
    rounds,
    standings,
    podium: isKnockout ? podium(matches, lastRound, tournament.thirdPlace) : null,
  };
}

// Winner and runner-up from the final; 3rd from the 3rd-place match, or both semifinal losers without one.
function podium(matches: TournamentMatchView[], lastRound: number, thirdPlace: boolean): Podium {
  const at = (round: number, position: number) => matches.find((m) => m.round === round && m.position === position);
  const winner = (m: TournamentMatchView | undefined) =>
    m?.state === "played" ? (m.scoreA! > m.scoreB! ? m.playerA : m.playerB) : null;
  const loser = (m: TournamentMatchView | undefined) =>
    m?.state === "played" ? (m.scoreA! > m.scoreB! ? m.playerB : m.playerA) : null;

  const final = at(lastRound, 0);
  const third = thirdPlace
    ? [winner(at(lastRound, 1))]
    : [loser(at(lastRound - 1, 0)), loser(at(lastRound - 1, 1))];
  return { first: winner(final), second: loser(final), third: third.filter((p) => p !== null) };
}

// My tournament matches that are ready to play now (active tournament, both players known, not played, no report waiting),
// for the front page's "Your tournament matches".
export function openMatchesFor(playerId: string): OpenTournamentMatchRow[] {
  return getOpenTournamentMatches(playerId);
}

// Newest first, with player count and progress (for the tournament list page).
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
