// Database access: opens SQLite, creates tables, and holds all SQL queries. No business logic here.
import { DatabaseSync } from "node:sqlite";

// Set by openDatabase. Every function below uses this connection.
let db: DatabaseSync;

// Opens the database (a file path, or ":memory:" in tests) and creates the tables if they don't exist.
// Call once at startup, before any other function in this file.
export function openDatabase(path: string): void {
  db = new DatabaseSync(path);

  // SQLite ignores foreign keys unless you turn them on, once per connection.
  db.exec("PRAGMA foreign_keys = ON;");

  // Write-ahead logging: website reads don't block bot writes (and the other way around).
  // Stored in the file, so it stays on. In-memory databases ignore it.
  db.exec("PRAGMA journal_mode = WAL;");

  initSchema();
}

function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id           TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      avatar_url   TEXT,
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

  addColumnIfMissing("players", "avatar_url", "TEXT");
}

// Migration for databases created before a column existed. CREATE TABLE IF NOT EXISTS never changes an existing table.
function addColumnIfMissing(table: string, column: string, type: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
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

// Creates the player with a starting rating, or refreshes their display name and avatar if they already exist.
export function upsertPlayer(id: string, displayName: string, avatarUrl: string | null, startingRating: number): void {
  db.prepare(`
    INSERT INTO players (id, display_name, avatar_url, rating, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, avatar_url = excluded.avatar_url
  `).run(id, displayName, avatarUrl, startingRating, new Date().toISOString());
}

export interface PlayerRow {
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  matchesPlayed: number;
}

// Name, avatar, current rating and number of matches played, or undefined if the player doesn't exist.
export function getPlayer(id: string): PlayerRow | undefined {
  const row = db.prepare(`
    SELECT
      display_name,
      avatar_url,
      rating,
      (SELECT COUNT(*) FROM matches WHERE winner_id = players.id OR loser_id = players.id) AS matches_played
    FROM players
    WHERE id = ?
  `).get(id) as { display_name: string; avatar_url: string | null; rating: number; matches_played: number } | undefined;

  return (
    row && {
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      rating: row.rating,
      matchesPlayed: row.matches_played,
    }
  );
}

export function updatePlayerRating(id: string, rating: number): void {
  db.prepare("UPDATE players SET rating = ? WHERE id = ?").run(rating, id);
}

// Sets every player's rating to the same value. No WHERE on purpose: used before a full replay.
export function resetAllRatings(rating: number): void {
  db.prepare("UPDATE players SET rating = ?").run(rating);
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

export interface ReplayMatchRow {
  id: number;
  winnerId: string;
  loserId: string;
  format: string;
  winnerGames: number;
  loserGames: number;
}

// Every match in the order it was logged (oldest first), with just what a replay needs.
export function getAllMatchesForReplay(): ReplayMatchRow[] {
  const rows = db.prepare(`
    SELECT id, winner_id, loser_id, format, winner_games, loser_games
    FROM matches
    ORDER BY id ASC
  `).all() as {
    id: number;
    winner_id: string;
    loser_id: string;
    format: string;
    winner_games: number;
    loser_games: number;
  }[];

  return rows.map((row) => ({
    id: row.id,
    winnerId: row.winner_id,
    loserId: row.loser_id,
    format: row.format,
    winnerGames: row.winner_games,
    loserGames: row.loser_games,
  }));
}

// Deletes a match. Its rating_history rows are removed automatically (ON DELETE CASCADE).
export function deleteMatch(matchId: number): void {
  db.prepare("DELETE FROM matches WHERE id = ?").run(matchId);
}

// Deletes every rating_history row. No WHERE on purpose: a replay rewrites the whole history.
export function deleteAllRatingHistory(): void {
  db.prepare("DELETE FROM rating_history").run();
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

export interface RatingHistoryRow {
  matchId: number;
  ratingBefore: number;
  ratingAfter: number;
}

// One player's rating change in every match they played, oldest first (for profile charts).
export function getRatingHistory(playerId: string): RatingHistoryRow[] {
  const rows = db.prepare(`
    SELECT match_id, rating_before, rating_after
    FROM rating_history
    WHERE player_id = ?
    ORDER BY match_id ASC
  `).all(playerId) as { match_id: number; rating_before: number; rating_after: number }[];

  return rows.map((row) => ({ matchId: row.match_id, ratingBefore: row.rating_before, ratingAfter: row.rating_after }));
}

export function insertRatingHistory(matchId: number, playerId: string, ratingBefore: number, ratingAfter: number): void {
  db.prepare(`
    INSERT INTO rating_history (match_id, player_id, rating_before, rating_after)
    VALUES (?, ?, ?, ?)
  `).run(matchId, playerId, ratingBefore, ratingAfter);
}
