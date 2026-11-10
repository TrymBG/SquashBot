// Business logic for reading data: leaderboard, player profiles, match history, head-to-head.
import {
  getLeaderboard as queryLeaderboard,
  getPlayer,
  getPlayerMatches as queryPlayerMatches,
  type LeaderboardRow,
  type PlayerMatchRow,
} from "../db.js";
import { STARTING_RATING } from "../elo.js";

export type { LeaderboardRow, PlayerMatchRow };

const LEADERBOARD_SIZE = 20;
const RECENT_FORM_SIZE = 5;
const HEAD_TO_HEAD_RECENT_SIZE = 5;

export function getLeaderboard(): LeaderboardRow[] {
  return queryLeaderboard(LEADERBOARD_SIZE);
}

export type Result = "W" | "L";

export interface PlayerProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  peakRating: number;
  position: number | null; // place on the leaderboard, null with no matches
  rankedPlayers: number; // how many players are on the leaderboard ("#2 of 6")
  wins: number;
  losses: number;
  winRate: number | null; // 0 to 1, null with no matches
  streak: { result: Result; count: number } | null;
  recentForm: Result[]; // newest first
  ratingHistory: { matchId: number; playedAt: string; rating: number }[]; // oldest first, for the chart
}

// Everything the profile page shows, or undefined if the player doesn't exist.
// The stats are computed from the player's full match list: a few hundred rows at most at this scale.
export function getPlayerProfile(playerId: string): PlayerProfile | undefined {
  const player = getPlayer(playerId);
  if (!player) {
    return undefined;
  }

  const matches = queryPlayerMatches(playerId); // newest first
  const wins = matches.filter((m) => m.won).length;
  const losses = matches.length - wins;

  const ranked = queryLeaderboard();
  const index = ranked.findIndex((row) => row.id === playerId);

  return {
    id: playerId,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    rating: player.rating,
    // The starting rating counts too: a player who has only lost peaked at the start.
    peakRating: Math.max(STARTING_RATING, ...matches.map((m) => m.ratingAfter)),
    position: index === -1 ? null : index + 1,
    rankedPlayers: ranked.length,
    wins,
    losses,
    winRate: matches.length === 0 ? null : wins / matches.length,
    streak: currentStreak(matches),
    recentForm: matches.slice(0, RECENT_FORM_SIZE).map(toResult),
    ratingHistory: matches
      .map((m) => ({ matchId: m.matchId, playedAt: m.playedAt, rating: m.ratingAfter }))
      .reverse(),
  };
}

export interface MatchPage {
  matches: PlayerMatchRow[];
  nextBefore: number | null; // pass as `before` to get the next (older) page, null on the last page
}

// One page of a player's match history, newest first (cursor paging: "the `limit` matches older than `before`").
// Undefined if the player doesn't exist.
export function getPlayerMatches(playerId: string, limit: number, before?: number): MatchPage | undefined {
  if (!getPlayer(playerId)) {
    return undefined;
  }
  const matches = queryPlayerMatches(playerId, { limit, before });
  // A full page means there may be more. An extra empty request at the very end is the accepted cost.
  const last = matches.at(-1);
  return { matches, nextBefore: matches.length === limit && last ? last.matchId : null };
}

export interface HeadToHeadPlayer {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  wins: number;
}

export interface HeadToHead {
  player: HeadToHeadPlayer;
  opponent: HeadToHeadPlayer;
  recentMatches: PlayerMatchRow[]; // newest first, seen from `player`'s side
}

// The record between two players, or undefined if either doesn't exist.
export function getHeadToHead(playerId: string, opponentId: string): HeadToHead | undefined {
  const player = getPlayer(playerId);
  const opponent = getPlayer(opponentId);
  if (!player || !opponent) {
    return undefined;
  }

  const matches = queryPlayerMatches(playerId, { opponentId });
  const wins = matches.filter((m) => m.won).length;

  return {
    player: { id: playerId, displayName: player.displayName, avatarUrl: player.avatarUrl, rating: player.rating, wins },
    opponent: {
      id: opponentId,
      displayName: opponent.displayName,
      avatarUrl: opponent.avatarUrl,
      rating: opponent.rating,
      wins: matches.length - wins,
    },
    recentMatches: matches.slice(0, HEAD_TO_HEAD_RECENT_SIZE),
  };
}

function toResult(match: PlayerMatchRow): Result {
  return match.won ? "W" : "L";
}

// How many matches in a row the newest result has repeated, e.g. 3 wins in a row. Null with no matches.
function currentStreak(matchesNewestFirst: PlayerMatchRow[]): PlayerProfile["streak"] {
  const newest = matchesNewestFirst[0];
  if (!newest) {
    return null;
  }
  let count = 0;
  for (const match of matchesNewestFirst) {
    if (match.won !== newest.won) break;
    count++;
  }
  return { result: toResult(newest), count };
}
