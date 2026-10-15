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

export function insertRatingHistory(matchId: number, playerId: string, ratingBefore: number, ratingAfter: number): void {
  db.prepare(`
    INSERT INTO rating_history (match_id, player_id, rating_before, rating_after)
    VALUES (?, ?, ?, ?)
  `).run(matchId, playerId, ratingBefore, ratingAfter);
}
