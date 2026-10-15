// Database access: opens SQLite, creates tables, and holds all SQL queries. No business logic here.
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("squash.db");

// SQLite ignores foreign keys unless you turn them on, once per connection.
db.exec("PRAGMA foreign_keys = ON;");

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id           TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      rating       REAL NOT NULL,
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matches (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      winner_id    TEXT NOT NULL REFERENCES players(id),
      loser_id     TEXT NOT NULL REFERENCES players(id),
      winner_games INTEGER NOT NULL,
      loser_games  INTEGER NOT NULL,
      format       TEXT NOT NULL,
      reported_by  TEXT NOT NULL REFERENCES players(id),
      played_at    TEXT NOT NULL
    );

    -- One row per player per match. Deleting a match deletes its rows too (used by /undo).
    CREATE TABLE IF NOT EXISTS rating_history (
      match_id      INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      player_id     TEXT NOT NULL REFERENCES players(id),
      rating_before REAL NOT NULL,
      rating_after  REAL NOT NULL,
      PRIMARY KEY (match_id, player_id)
    );
  `);
}

// Runs fn inside a transaction: either everything in it is saved, or nothing is.
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// Creates the player with a starting rating, or updates their display name if they already exist.
export function upsertPlayer(id: string, displayName: string, startingRating: number): void {
  db.prepare(`
    INSERT INTO players (id, display_name, rating, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name
  `).run(id, displayName, startingRating, new Date().toISOString());
}

export interface PlayerRow {
  rating: number;
  matchesPlayed: number;
}

// Current rating and number of matches played, or undefined if the player doesn't exist.
export function getPlayer(id: string): PlayerRow | undefined {
  const row = db.prepare(`
    SELECT
      rating,
      (SELECT COUNT(*) FROM matches WHERE winner_id = players.id OR loser_id = players.id) AS matches_played
    FROM players
    WHERE id = ?
  `).get(id) as { rating: number; matches_played: number } | undefined;

  return row && { rating: row.rating, matchesPlayed: row.matches_played };
}

export function updatePlayerRating(id: string, rating: number): void {
  db.prepare("UPDATE players SET rating = ? WHERE id = ?").run(rating, id);
}

export interface NewMatch {
  winnerId: string;
  loserId: string;
  winnerGames: number;
  loserGames: number;
  format: string;
  reportedBy: string;
  playedAt: string;
}

// Saves a match and returns its id.
export function insertMatch(match: NewMatch): number {
  const result = db.prepare(`
    INSERT INTO matches (winner_id, loser_id, winner_games, loser_games, format, reported_by, played_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(match.winnerId, match.loserId, match.winnerGames, match.loserGames, match.format, match.reportedBy, match.playedAt);
  return Number(result.lastInsertRowid);
}

export interface MatchRow {
  id: number;
  winnerId: string;
  winnerName: string;
  loserId: string;
  loserName: string;
  winnerGames: number;
  loserGames: number;
  format: string;
  reportedBy: string;
  playedAt: string;
}

// The most recently logged match (highest id), with both players' names.
export function getLatestMatch(): MatchRow | undefined {
  const row = db.prepare(`
    SELECT
      m.id, m.winner_id, w.display_name AS winner_name, m.loser_id, l.display_name AS loser_name,
      m.winner_games, m.loser_games, m.format, m.reported_by, m.played_at
    FROM matches m
    JOIN players w ON w.id = m.winner_id
    JOIN players l ON l.id = m.loser_id
    ORDER BY m.id DESC
    LIMIT 1
  `).get() as
    | {
        id: number;
        winner_id: string;
        winner_name: string;
        loser_id: string;
        loser_name: string;
        winner_games: number;
        loser_games: number;
        format: string;
        reported_by: string;
        played_at: string;
      }
    | undefined;

  return (
    row && {
      id: row.id,
      winnerId: row.winner_id,
      winnerName: row.winner_name,
      loserId: row.loser_id,
      loserName: row.loser_name,
      winnerGames: row.winner_games,
      loserGames: row.loser_games,
      format: row.format,
      reportedBy: row.reported_by,
      playedAt: row.played_at,
    }
  );
}

// Each player's rating from just before the given match.
export function getRatingsBefore(matchId: number): { playerId: string; ratingBefore: number }[] {
  const rows = db.prepare(`
    SELECT player_id, rating_before FROM rating_history WHERE match_id = ?
  `).all(matchId) as { player_id: string; rating_before: number }[];

  return rows.map((row) => ({ playerId: row.player_id, ratingBefore: row.rating_before }));
}

// Deletes a match. Its rating_history rows are removed automatically (ON DELETE CASCADE).
export function deleteMatch(matchId: number): void {
  db.prepare("DELETE FROM matches WHERE id = ?").run(matchId);
}

export interface LeaderboardRow {
  id: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
}

// Players with at least one match, highest rating first.
export function getLeaderboard(limit: number): LeaderboardRow[] {
  const rows = db.prepare(`
    SELECT
      p.id,
      p.display_name,
      p.rating,
      (SELECT COUNT(*) FROM matches WHERE winner_id = p.id) AS wins,
      (SELECT COUNT(*) FROM matches WHERE loser_id = p.id) AS losses
    FROM players p
    WHERE EXISTS (SELECT 1 FROM matches WHERE winner_id = p.id OR loser_id = p.id)
    ORDER BY p.rating DESC
    LIMIT ?
  `).all(limit) as { id: string; display_name: string; rating: number; wins: number; losses: number }[];

  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    rating: row.rating,
    wins: row.wins,
    losses: row.losses,
  }));
}

export function insertRatingHistory(matchId: number, playerId: string, ratingBefore: number, ratingAfter: number): void {
  db.prepare(`
    INSERT INTO rating_history (match_id, player_id, rating_before, rating_after)
    VALUES (?, ?, ?, ?)
  `).run(matchId, playerId, ratingBefore, ratingAfter);
}
