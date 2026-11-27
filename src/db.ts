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

    -- Website accounts. Each account belongs to exactly one player, so web and Discord players share all stats code.
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      player_id     TEXT NOT NULL UNIQUE REFERENCES players(id),
      created_at    TEXT NOT NULL
    );

    -- Logged-in browsers. Stores a hash of the cookie's token, never the token itself.
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- One-time password reset links (made by the admin with 'npm run reset-link'). Only the token's hash is stored,
    -- like sessions. Valid for a short time and only once (used_at is set when it's used).
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      used_at    TEXT
    );

    -- Results reported on the website. Pending until the opponent confirms; confirming records a real match.
    -- Scores are from the reporter's view. Resolved reports are kept (audit trail).
    CREATE TABLE IF NOT EXISTS match_reports (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id    TEXT NOT NULL REFERENCES players(id),
      opponent_id    TEXT NOT NULL REFERENCES players(id),
      format         TEXT NOT NULL,
      reporter_games INTEGER NOT NULL,
      opponent_games INTEGER NOT NULL,
      played_at      TEXT NOT NULL,
      status         TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
      created_at     TEXT NOT NULL,
      resolved_at    TEXT,
      -- SET NULL: if the match is undone later, the report stays but loses its link.
      match_id       INTEGER REFERENCES matches(id) ON DELETE SET NULL
    );

    -- Tournaments. "finished" isn't stored: a tournament is finished when every one of its matches is played.
    CREATE TABLE IF NOT EXISTS tournaments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      type         TEXT NOT NULL CHECK (type IN ('round_robin', 'knockout')),
      match_format TEXT NOT NULL,
      ranking      TEXT CHECK (ranking IN ('wins', 'points')), -- round robin only
      third_place  INTEGER NOT NULL DEFAULT 0, -- knockout only: 1 = the semifinal losers play for 3rd
      status       TEXT NOT NULL CHECK (status IN ('draft', 'active')),
      organizer_id TEXT NOT NULL REFERENCES players(id),
      created_at   TEXT NOT NULL,
      started_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS tournament_players (
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      player_id     TEXT NOT NULL REFERENCES players(id),
      added_at      TEXT NOT NULL,
      seed          INTEGER, -- knockout: 1 = top seed, set at the start (by rating)
      PRIMARY KEY (tournament_id, player_id)
    );

    -- The scheduled matches of a tournament, one row per slot (round, position). match_id is set when a result is
    -- confirmed; SET NULL: if that match is undone later, the tournament match is simply unplayed again.
    -- Players can be NULL in a knockout: a later-round slot is empty until the feeder matches are played.
    CREATE TABLE IF NOT EXISTS tournament_matches (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round         INTEGER NOT NULL,
      position      INTEGER NOT NULL,
      player_a      TEXT REFERENCES players(id),
      player_b      TEXT REFERENCES players(id),
      match_id      INTEGER REFERENCES matches(id) ON DELETE SET NULL,
      UNIQUE (tournament_id, round, position)
    );

    -- Groups: a group's leaderboard is the overall ladder filtered to its members (one rating per player, like chess).
    -- invite_code is the secret part of the join link. Stored as plain text (unlike session tokens), because members
    -- must be able to see the link again; a leaked code only lets someone join the group, never into an account.
    CREATE TABLE IF NOT EXISTS groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      created_at  TEXT NOT NULL
    );

    -- Exactly one owner per group (renews the link, removes members, deletes the group).
    CREATE TABLE IF NOT EXISTS group_members (
      group_id  INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id),
      role      TEXT NOT NULL CHECK (role IN ('owner', 'member')),
      joined_at TEXT NOT NULL,
      PRIMARY KEY (group_id, player_id)
    );
  `);

  // Guard: an early version of tournament_matches (players NOT NULL, no position) can't be changed in place, and
  // CREATE TABLE IF NOT EXISTS leaves it as it is. Only dev databases ever had it, so ask for a fresh one.
  const tournamentMatchColumns = db.prepare("PRAGMA table_info(tournament_matches)").all() as { name: string }[];
  if (!tournamentMatchColumns.some((c) => c.name === "position")) {
    throw new Error("This database has an old version of the tournament tables. Run `npm run seed` for a fresh seed.db.");
  }

  addColumnIfMissing("players", "avatar_url", "TEXT");
  // A web report can belong to a scheduled tournament match.
  addColumnIfMissing("match_reports", "tournament_match_id", "INTEGER REFERENCES tournament_matches(id)");

  // Recorded vs rated: a match is rated (moved ratings, has rating_history) exactly when rating_order is set.
  // Unranked matches never get one; ranked tournament matches get one when the tournament ends. Replay uses this order.
  addColumnIfMissing("matches", "ranked", "INTEGER NOT NULL DEFAULT 1");
  if (addColumnIfMissing("matches", "rating_order", "INTEGER")) {
    db.exec("UPDATE matches SET rating_order = id"); // everything before this column existed was rated, in id order
  }
  addColumnIfMissing("tournaments", "ranked", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing("match_reports", "ranked", "INTEGER NOT NULL DEFAULT 1");
  // Set when the player's web account was deleted: the player stays (as "Deleted player") so opponents' matches and
  // ratings don't change, but is hidden from the leaderboard.
  addColumnIfMissing("players", "deleted_at", "TEXT");
}

// Migration for databases created before a column existed. CREATE TABLE IF NOT EXISTS never changes an existing table.
// Returns true if it added the column (so the caller can fill it for existing rows).
function addColumnIfMissing(table: string, column: string, type: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some((c) => c.name === column)) {
    return false;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  return true;
}

// Runs fn inside a transaction: either everything in it is saved, or nothing is.
// Reentrant: called while a transaction is already open (e.g. confirming a report calls recordMatch, which has its
// own transaction()), it just runs fn inside the outer one, which commits or rolls back everything. SQLite refuses a
// nested BEGIN. Like Spring's @Transactional with the default REQUIRED propagation.
export function transaction<T>(fn: () => T): T {
  if (db.isTransaction) {
    return fn();
  }
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
      -- Rated matches only: the K-factor's "first 10 matches" must count the same way live and in a replay.
      (SELECT COUNT(*) FROM matches
        WHERE (winner_id = players.id OR loser_id = players.id) AND rating_order IS NOT NULL) AS matches_played
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
  ranked: boolean; // false = unranked: recorded, never rated
  ratingOrder: number | null; // set = rated now (its place in the rating order); null = not rated (yet)
}

// Saves a match and returns its id.
export function insertMatch(match: NewMatch): number {
  const result = db.prepare(`
    INSERT INTO matches (winner_id, loser_id, winner_games, loser_games, format, reported_by, played_at, ranked, rating_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    match.winnerId,
    match.loserId,
    match.winnerGames,
    match.loserGames,
    match.format,
    match.reportedBy,
    match.playedAt,
    match.ranked ? 1 : 0,
    match.ratingOrder,
  );
  return Number(result.lastInsertRowid);
}

// The next free place in the rating order (rated matches are rated, and replayed, in this order).
export function nextRatingOrder(): number {
  const row = db.prepare("SELECT COALESCE(MAX(rating_order), 0) + 1 AS next FROM matches").get() as { next: number };
  return row.next;
}

export function setRatingOrder(matchId: number, ratingOrder: number | null): void {
  db.prepare("UPDATE matches SET rating_order = ? WHERE id = ?").run(ratingOrder, matchId);
}

// The matches of one tournament (played and confirmed), oldest first.
export function getTournamentMatchIds(tournamentId: number): number[] {
  const rows = db.prepare(`
    SELECT tm.match_id FROM tournament_matches tm
    WHERE tm.tournament_id = ? AND tm.match_id IS NOT NULL
    ORDER BY tm.match_id
  `).all(tournamentId) as { match_id: number }[];
  return rows.map((row) => row.match_id);
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

// Every rated match in rating order, with just what a replay needs. Unranked matches and ranked tournament
// matches that aren't rated yet (rating_order NULL) are left out.
export function getAllMatchesForReplay(): ReplayMatchRow[] {
  const rows = db.prepare(`
    SELECT id, winner_id, loser_id, format, winner_games, loser_games
    FROM matches
    WHERE rating_order IS NOT NULL
    ORDER BY rating_order ASC
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

// One match with what rating it needs, or undefined.
export function getMatchForRating(id: number): (ReplayMatchRow & { ranked: boolean; ratingOrder: number | null }) | undefined {
  const row = db.prepare(`
    SELECT id, winner_id, loser_id, format, winner_games, loser_games, ranked, rating_order FROM matches WHERE id = ?
  `).get(id) as
    | { id: number; winner_id: string; loser_id: string; format: string; winner_games: number; loser_games: number; ranked: number; rating_order: number | null }
    | undefined;
  return (
    row && {
      id: row.id,
      winnerId: row.winner_id,
      loserId: row.loser_id,
      format: row.format,
      winnerGames: row.winner_games,
      loserGames: row.loser_games,
      ranked: row.ranked === 1,
      ratingOrder: row.rating_order,
    }
  );
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
  avatarUrl: string | null;
  rating: number;
  wins: number;
  losses: number;
}

// Every player's rating at a moment in the past: the rating after their last rated match played before `before`
// (latest by rating_order). Players with no rated match before then are left out: they weren't on the leaderboard.
// Highest rating first, so the index is the leaderboard position back then. Deleted players are left out, like now.
// With a groupId, only that group's members count (positions within the group).
export function getRatingsBefore(before: string, groupId: number | null = null): { playerId: string; rating: number }[] {
  const rows = db.prepare(`
    SELECT player_id, rating_after FROM (
      SELECT rh.player_id, rh.rating_after,
             ROW_NUMBER() OVER (PARTITION BY rh.player_id ORDER BY m.rating_order DESC) AS newest
      FROM rating_history rh
      JOIN matches m ON m.id = rh.match_id
      JOIN players p ON p.id = rh.player_id
      WHERE m.played_at < :before AND m.rating_order IS NOT NULL AND p.deleted_at IS NULL
        AND (:groupId IS NULL OR p.id IN (SELECT player_id FROM group_members WHERE group_id = :groupId))
    )
    WHERE newest = 1
    ORDER BY rating_after DESC
  `).all({ before, groupId }) as { player_id: string; rating_after: number }[];
  return rows.map((row) => ({ playerId: row.player_id, rating: row.rating_after }));
}

// Players with at least one match, highest rating first. The default -1 means no limit (SQLite treats a negative LIMIT that way).
// With a groupId, only that group's members (a group ladder). One query for both: `:groupId IS NULL OR …`.
export function getLeaderboard(limit = -1, groupId: number | null = null): LeaderboardRow[] {
  const rows = db.prepare(`
    SELECT
      p.id,
      p.display_name,
      p.avatar_url,
      p.rating,
      -- Rated matches only: the leaderboard ranks by rating, so its W–L counts the matches that made the rating.
      (SELECT COUNT(*) FROM matches WHERE winner_id = p.id AND rating_order IS NOT NULL) AS wins,
      (SELECT COUNT(*) FROM matches WHERE loser_id = p.id AND rating_order IS NOT NULL) AS losses
    FROM players p
    WHERE EXISTS (SELECT 1 FROM matches WHERE (winner_id = p.id OR loser_id = p.id) AND rating_order IS NOT NULL)
      AND p.deleted_at IS NULL
      AND (:groupId IS NULL OR p.id IN (SELECT player_id FROM group_members WHERE group_id = :groupId))
    ORDER BY p.rating DESC
    LIMIT :limit
  `).all({ limit, groupId }) as {
    id: string;
    display_name: string;
    avatar_url: string | null;
    rating: number;
    wins: number;
    losses: number;
  }[];

  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    rating: row.rating,
    wins: row.wins,
    losses: row.losses,
  }));
}

// One match seen from one player's side: who they played, the score from their view, and their rating change.
export interface PlayerMatchRow {
  matchId: number;
  playedAt: string;
  format: string;
  opponentId: string;
  opponentName: string;
  opponentAvatarUrl: string | null;
  won: boolean;
  myGames: number;
  opponentGames: number;
  ratingBefore: number | null; // null: not rated (unranked, or a tournament that hasn't finished)
  ratingAfter: number | null;
  ranked: boolean; // false = unranked: never changes ratings
  tournament: { id: number; name: string } | null; // set when the match was part of a tournament
}

export interface PlayerMatchFilter {
  // `| undefined` lets callers pass a value that may be missing (exactOptionalPropertyTypes is on).
  limit?: number | undefined; // default: no limit
  before?: number | undefined; // only matches with a lower id (older), for paging
  opponentId?: string | undefined; // only matches against this player (head-to-head)
  format?: string | undefined; // only matches in this format (bo1, bo3, bo5, ft6)
}

// A player's matches, newest first, with their rating change in each (none for matches that aren't rated).
export function getPlayerMatches(playerId: string, filter: PlayerMatchFilter = {}): PlayerMatchRow[] {
  const rows = db.prepare(`
    SELECT
      m.id, m.played_at, m.format,
      o.id AS opponent_id, o.display_name AS opponent_name, o.avatar_url AS opponent_avatar_url,
      m.winner_id = :playerId AS won,
      CASE WHEN m.winner_id = :playerId THEN m.winner_games ELSE m.loser_games END AS my_games,
      CASE WHEN m.winner_id = :playerId THEN m.loser_games ELSE m.winner_games END AS opponent_games,
      h.rating_before, h.rating_after, m.ranked,
      t.id AS tournament_id, t.name AS tournament_name
    FROM matches m
    -- LEFT JOIN: unrated matches have no rating_history rows but still belong in the history.
    LEFT JOIN rating_history h ON h.match_id = m.id AND h.player_id = :playerId
    JOIN players o ON o.id = CASE WHEN m.winner_id = :playerId THEN m.loser_id ELSE m.winner_id END
    LEFT JOIN tournament_matches tm ON tm.match_id = m.id
    LEFT JOIN tournaments t ON t.id = tm.tournament_id
    WHERE (m.winner_id = :playerId OR m.loser_id = :playerId)
      AND (:before IS NULL OR m.id < :before)
      AND (:opponentId IS NULL OR o.id = :opponentId)
      AND (:format IS NULL OR m.format = :format)
    ORDER BY m.id DESC
    LIMIT :limit
  `).all({
    playerId,
    before: filter.before ?? null,
    opponentId: filter.opponentId ?? null,
    format: filter.format ?? null,
    limit: filter.limit ?? -1,
  }) as {
    id: number;
    played_at: string;
    format: string;
    opponent_id: string;
    opponent_name: string;
    opponent_avatar_url: string | null;
    won: number;
    my_games: number;
    opponent_games: number;
    rating_before: number | null;
    rating_after: number | null;
    ranked: number;
    tournament_id: number | null;
    tournament_name: string | null;
  }[];

  return rows.map((row) => ({
    matchId: row.id,
    playedAt: row.played_at,
    format: row.format,
    opponentId: row.opponent_id,
    opponentName: row.opponent_name,
    opponentAvatarUrl: row.opponent_avatar_url,
    won: row.won === 1, // SQLite has no boolean type: a comparison gives 1 or 0
    myGames: row.my_games,
    opponentGames: row.opponent_games,
    ratingBefore: row.rating_before,
    ratingAfter: row.rating_after,
    ranked: row.ranked === 1,
    tournament: row.tournament_id === null ? null : { id: row.tournament_id, name: row.tournament_name! },
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

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  playerId: string;
  displayName: string; // from the linked player
}

export function insertUser(id: string, email: string, passwordHash: string, playerId: string): void {
  db.prepare(`
    INSERT INTO users (id, email, password_hash, player_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, email, passwordHash, playerId, new Date().toISOString());
}

// Selects a user with their player's display name. `where` goes into the SQL text, so its type only allows these
// two fixed column names: user input can only ever be the `?` value.
function queryUser(where: "u.email" | "u.id" | "u.player_id", value: string): UserRow | undefined {
  const row = db.prepare(`
    SELECT u.id, u.email, u.password_hash, u.player_id, p.display_name
    FROM users u
    JOIN players p ON p.id = u.player_id
    WHERE ${where} = ?
  `).get(value) as
    | { id: string; email: string; password_hash: string; player_id: string; display_name: string }
    | undefined;

  return (
    row && {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      playerId: row.player_id,
      displayName: row.display_name,
    }
  );
}

// Emails are stored lowercase, so callers pass a lowercased email.
export function getUserByEmail(email: string): UserRow | undefined {
  return queryUser("u.email", email);
}

export function getUserById(id: string): UserRow | undefined {
  return queryUser("u.id", id);
}

export function getUserByPlayerId(playerId: string): UserRow | undefined {
  return queryUser("u.player_id", playerId);
}

// Every web account, by name (dev "Log in as…" list).
export function getAllUsers(): UserRow[] {
  const rows = db.prepare(`
    SELECT u.id, u.email, u.password_hash, u.player_id, p.display_name
    FROM users u
    JOIN players p ON p.id = u.player_id
    ORDER BY p.display_name COLLATE NOCASE
  `).all() as { id: string; email: string; password_hash: string; player_id: string; display_name: string }[];
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    playerId: row.player_id,
    displayName: row.display_name,
  }));
}

export interface SessionRow {
  userId: string;
  expiresAt: string;
}

export function insertSession(tokenHash: string, userId: string, expiresAt: string): void {
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash, userId, new Date().toISOString(), expiresAt);
}

export function getSession(tokenHash: string): SessionRow | undefined {
  const row = db.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?").get(tokenHash) as
    | { user_id: string; expires_at: string }
    | undefined;
  return row && { userId: row.user_id, expiresAt: row.expires_at };
}

export function deleteSession(tokenHash: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

// ISO timestamps in UTC sort as text, so a string comparison works for "older than now".
export function deleteExpiredSessions(now: string): void {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
}

// Logs a user out everywhere (after a password reset).
export function deleteSessionsForUser(userId: string): void {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function updatePasswordHash(userId: string, passwordHash: string): void {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
}

// Deletes the account row. Its sessions and reset links go with it (ON DELETE CASCADE); the player row stays.
export function deleteUser(userId: string): void {
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

// Replaces the player's name and avatar after their account is deleted. The id, matches and rating stay, so the
// opponents' histories and ratings are unchanged.
export function anonymisePlayer(playerId: string, displayName: string, deletedAt: string): void {
  db.prepare("UPDATE players SET display_name = ?, avatar_url = NULL, deleted_at = ? WHERE id = ?").run(displayName, deletedAt, playerId);
}

// Draft tournaments (nothing played yet) the player organises: deleted with the account. Players cascade.
export function deleteDraftTournamentsOrganisedBy(playerId: string): void {
  db.prepare("DELETE FROM tournaments WHERE organizer_id = ? AND status = 'draft'").run(playerId);
}

// Takes the player out of every draft tournament they joined.
export function removePlayerFromDraftTournaments(playerId: string): void {
  db.prepare(`
    DELETE FROM tournament_players
    WHERE player_id = ? AND tournament_id IN (SELECT id FROM tournaments WHERE status = 'draft')
  `).run(playerId);
}

// A new reset link replaces the user's older ones, so only the newest link works.
export function replacePasswordReset(tokenHash: string, userId: string, expiresAt: string): void {
  db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(userId);
  db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(tokenHash, userId, expiresAt);
}

export interface PasswordResetRow {
  userId: string;
  expiresAt: string;
  usedAt: string | null;
}

export function getPasswordReset(tokenHash: string): PasswordResetRow | undefined {
  const row = db.prepare("SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?").get(tokenHash) as
    | { user_id: string; expires_at: string; used_at: string | null }
    | undefined;
  return row && { userId: row.user_id, expiresAt: row.expires_at, usedAt: row.used_at };
}

// Marks the link as used. The WHERE only matches an unused link, so two requests at once can't both use it;
// returns false if it was already used.
export function markPasswordResetUsed(tokenHash: string, usedAt: string): boolean {
  const result = db.prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL").run(usedAt, tokenHash);
  return Number(result.changes) === 1;
}

export type ReportStatus = "pending" | "confirmed" | "rejected" | "cancelled";

export interface NewReport {
  reporterId: string;
  opponentId: string;
  format: string;
  reporterGames: number;
  opponentGames: number;
  playedAt: string;
  tournamentMatchId?: number | null | undefined; // set when the report is for a scheduled tournament match
  ranked?: boolean | undefined; // default true. false = unranked: the match never changes ratings
}

// A report with both players' names, as the website shows it.
export interface ReportRow extends NewReport {
  id: number;
  reporterName: string;
  opponentName: string;
  status: ReportStatus;
  createdAt: string;
  tournamentMatchId: number | null; // always known when read back (not optional like in NewReport)
  tournamentName: string | null; // for the "🏆 Winter cup" label
  ranked: boolean; // false = unranked: shown to the opponent before they confirm
}

// Saves a new pending report and returns its id.
export function insertReport(report: NewReport, createdAt: string): number {
  const result = db.prepare(`
    INSERT INTO match_reports
      (reporter_id, opponent_id, format, reporter_games, opponent_games, played_at, status, created_at, tournament_match_id, ranked)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(
    report.reporterId,
    report.opponentId,
    report.format,
    report.reporterGames,
    report.opponentGames,
    report.playedAt,
    createdAt,
    report.tournamentMatchId ?? null,
    report.ranked === false ? 0 : 1,
  );
  return Number(result.lastInsertRowid);
}

const REPORT_SELECT = `
  SELECT
    r.id, r.reporter_id, rp.display_name AS reporter_name, r.opponent_id, op.display_name AS opponent_name,
    r.format, r.reporter_games, r.opponent_games, r.played_at, r.status, r.created_at, r.tournament_match_id, r.ranked,
    t.name AS tournament_name
  FROM match_reports r
  JOIN players rp ON rp.id = r.reporter_id
  JOIN players op ON op.id = r.opponent_id
  LEFT JOIN tournament_matches rtm ON rtm.id = r.tournament_match_id
  LEFT JOIN tournaments t ON t.id = rtm.tournament_id
`;

interface ReportDbRow {
  id: number;
  reporter_id: string;
  reporter_name: string;
  opponent_id: string;
  opponent_name: string;
  format: string;
  reporter_games: number;
  opponent_games: number;
  played_at: string;
  status: ReportStatus;
  created_at: string;
  tournament_match_id: number | null;
  tournament_name: string | null;
  ranked: number;
}

function toReportRow(row: ReportDbRow): ReportRow {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    reporterName: row.reporter_name,
    opponentId: row.opponent_id,
    opponentName: row.opponent_name,
    format: row.format,
    reporterGames: row.reporter_games,
    opponentGames: row.opponent_games,
    playedAt: row.played_at,
    status: row.status,
    createdAt: row.created_at,
    tournamentMatchId: row.tournament_match_id,
    tournamentName: row.tournament_name,
    ranked: row.ranked === 1,
  };
}

export function getReport(id: number): ReportRow | undefined {
  const row = db.prepare(`${REPORT_SELECT} WHERE r.id = ?`).get(id) as ReportDbRow | undefined;
  return row && toReportRow(row);
}

// Pending reports where the player is the reporter or the opponent, newest first.
export function getPendingReportsFor(playerId: string): ReportRow[] {
  const rows = db.prepare(`
    ${REPORT_SELECT}
    WHERE r.status = 'pending' AND (r.reporter_id = :playerId OR r.opponent_id = :playerId)
    ORDER BY r.id DESC
  `).all({ playerId }) as unknown as ReportDbRow[]; // via unknown: TypeScript won't cast straight to the narrow `status` type

  return rows.map(toReportRow);
}

// Moves a report out of 'pending'. The WHERE only matches pending reports, so a report is resolved at most once;
// returns false if it wasn't pending anymore.
export function resolveReport(id: number, status: Exclude<ReportStatus, "pending">, resolvedAt: string, matchId: number | null): boolean {
  const result = db.prepare(`
    UPDATE match_reports SET status = ?, resolved_at = ?, match_id = ?
    WHERE id = ? AND status = 'pending'
  `).run(status, resolvedAt, matchId, id);
  return Number(result.changes) === 1;
}

export interface OpponentRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
}

// Players who have a web account (so they can log in and confirm), except the given one. By name.
export function getPlayersWithAccounts(exceptPlayerId: string): OpponentRow[] {
  const rows = db.prepare(`
    SELECT p.id, p.display_name, p.avatar_url, p.rating
    FROM players p
    JOIN users u ON u.player_id = p.id
    WHERE p.id != ?
    ORDER BY p.display_name COLLATE NOCASE
  `).all(exceptPlayerId) as { id: string; display_name: string; avatar_url: string | null; rating: number }[];
  return rows.map((row) => ({ id: row.id, displayName: row.display_name, avatarUrl: row.avatar_url, rating: row.rating }));
}

export function playerHasAccount(playerId: string): boolean {
  return db.prepare("SELECT 1 FROM users WHERE player_id = ?").get(playerId) !== undefined;
}

// A trivial query, so a health check fails if the database can't be read.
export function checkDatabase(): void {
  db.prepare("SELECT 1").get();
}

// Writes a consistent copy of the whole database to `path` (which must not exist yet), including changes still in the
// -wal file. Safe while the app is running, unlike copying the file, which can miss recent writes.
export function vacuumInto(path: string): void {
  db.prepare("VACUUM INTO ?").run(path);
}

// ---- Tournaments ----

export type TournamentType = "round_robin" | "knockout";
export type TournamentRanking = "wins" | "points";

export interface NewTournament {
  name: string;
  type: TournamentType;
  matchFormat: string;
  ranking: TournamentRanking | null;
  thirdPlace: boolean; // knockout: play a match for 3rd place
  ranked: boolean; // false = unranked tournament: its matches never change ratings
  organizerId: string;
}

export interface TournamentRow extends NewTournament {
  id: number;
  organizerName: string;
  status: "draft" | "active";
  createdAt: string;
  startedAt: string | null;
  playerCount: number;
  matchCount: number;
  playedCount: number;
}

export function insertTournament(tournament: NewTournament, createdAt: string): number {
  const result = db.prepare(`
    INSERT INTO tournaments (name, type, match_format, ranking, third_place, ranked, status, organizer_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)
  `).run(
    tournament.name,
    tournament.type,
    tournament.matchFormat,
    tournament.ranking,
    tournament.thirdPlace ? 1 : 0,
    tournament.ranked ? 1 : 0,
    tournament.organizerId,
    createdAt,
  );
  return Number(result.lastInsertRowid);
}

const TOURNAMENT_SELECT = `
  SELECT
    t.id, t.name, t.type, t.match_format, t.ranking, t.third_place, t.ranked, t.status, t.organizer_id, o.display_name AS organizer_name,
    t.created_at, t.started_at,
    (SELECT COUNT(*) FROM tournament_players tp WHERE tp.tournament_id = t.id) AS player_count,
    (SELECT COUNT(*) FROM tournament_matches tm WHERE tm.tournament_id = t.id) AS match_count,
    (SELECT COUNT(*) FROM tournament_matches tm WHERE tm.tournament_id = t.id AND tm.match_id IS NOT NULL) AS played_count
  FROM tournaments t
  JOIN players o ON o.id = t.organizer_id
`;

interface TournamentDbRow {
  id: number;
  name: string;
  type: TournamentType;
  match_format: string;
  ranking: TournamentRanking | null;
  third_place: number;
  ranked: number;
  status: "draft" | "active";
  organizer_id: string;
  organizer_name: string;
  created_at: string;
  started_at: string | null;
  player_count: number;
  match_count: number;
  played_count: number;
}

function toTournamentRow(row: TournamentDbRow): TournamentRow {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    matchFormat: row.match_format,
    ranking: row.ranking,
    thirdPlace: row.third_place === 1,
    ranked: row.ranked === 1,
    status: row.status,
    organizerId: row.organizer_id,
    organizerName: row.organizer_name,
    createdAt: row.created_at,
    startedAt: row.started_at,
    playerCount: row.player_count,
    matchCount: row.match_count,
    playedCount: row.played_count,
  };
}

export function getTournament(id: number): TournamentRow | undefined {
  const row = db.prepare(`${TOURNAMENT_SELECT} WHERE t.id = ?`).get(id) as unknown as TournamentDbRow | undefined;
  return row && toTournamentRow(row);
}

// Newest first.
export function getTournaments(): TournamentRow[] {
  const rows = db.prepare(`${TOURNAMENT_SELECT} ORDER BY t.id DESC`).all() as unknown as TournamentDbRow[];
  return rows.map(toTournamentRow);
}

// Active knockout tournaments (their brackets are re-synced after an undo).
export function getActiveKnockoutIds(): number[] {
  const rows = db.prepare("SELECT id FROM tournaments WHERE type = 'knockout' AND status = 'active'").all() as { id: number }[];
  return rows.map((row) => row.id);
}

export function setTournamentActive(id: number, startedAt: string): void {
  db.prepare("UPDATE tournaments SET status = 'active', started_at = ? WHERE id = ?").run(startedAt, id);
}

export interface TournamentPlayerRow {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  seed: number | null; // knockout, from the start
}

export function addTournamentPlayer(tournamentId: number, playerId: string, addedAt: string): void {
  db.prepare("INSERT INTO tournament_players (tournament_id, player_id, added_at) VALUES (?, ?, ?)").run(tournamentId, playerId, addedAt);
}

// Returns false if the player wasn't in the tournament.
export function removeTournamentPlayer(tournamentId: number, playerId: string): boolean {
  const result = db.prepare("DELETE FROM tournament_players WHERE tournament_id = ? AND player_id = ?").run(tournamentId, playerId);
  return Number(result.changes) === 1;
}

// In the order they joined (the schedule and the seeding tie-break use this order, so it's stable).
export function getTournamentPlayers(tournamentId: number): TournamentPlayerRow[] {
  const rows = db.prepare(`
    SELECT p.id, p.display_name, p.avatar_url, p.rating, tp.seed
    FROM tournament_players tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.tournament_id = ?
    ORDER BY tp.added_at, tp.rowid
  `).all(tournamentId) as { id: string; display_name: string; avatar_url: string | null; rating: number; seed: number | null }[];
  return rows.map((row) => ({
    playerId: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    rating: row.rating,
    seed: row.seed,
  }));
}

export function setTournamentSeed(tournamentId: number, playerId: string, seed: number): void {
  db.prepare("UPDATE tournament_players SET seed = ? WHERE tournament_id = ? AND player_id = ?").run(seed, tournamentId, playerId);
}

export function insertTournamentMatch(
  tournamentId: number,
  round: number,
  position: number,
  playerA: string | null,
  playerB: string | null,
): void {
  db.prepare("INSERT INTO tournament_matches (tournament_id, round, position, player_a, player_b) VALUES (?, ?, ?, ?, ?)").run(
    tournamentId,
    round,
    position,
    playerA,
    playerB,
  );
}

export function setTournamentMatchPlayers(id: number, playerA: string | null, playerB: string | null): void {
  db.prepare("UPDATE tournament_matches SET player_a = ?, player_b = ? WHERE id = ?").run(playerA, playerB, id);
}

// A scheduled tournament match with its result (scores from player A's side) once played, and whether a report
// for it is waiting for confirmation.
export interface TournamentMatchRow {
  id: number;
  tournamentId: number;
  round: number;
  position: number;
  playerA: string | null; // null: knockout slot not decided yet
  playerB: string | null;
  matchId: number | null;
  scoreA: number | null;
  scoreB: number | null;
  // The report waiting for confirmation, if any (at most one: a second report is refused while one is pending).
  pendingReport: { id: number; reporterId: string; reporterScore: number; opponentScore: number } | null;
}

const TOURNAMENT_MATCH_SELECT = `
  SELECT
    tm.id, tm.tournament_id, tm.round, tm.position, tm.player_a, tm.player_b, tm.match_id,
    CASE WHEN m.id IS NULL THEN NULL WHEN m.winner_id = tm.player_a THEN m.winner_games ELSE m.loser_games END AS score_a,
    CASE WHEN m.id IS NULL THEN NULL WHEN m.winner_id = tm.player_a THEN m.loser_games ELSE m.winner_games END AS score_b,
    pr.id AS pending_report_id, pr.reporter_id AS pending_reporter_id,
    pr.reporter_games AS pending_reporter_score, pr.opponent_games AS pending_opponent_score
  FROM tournament_matches tm
  LEFT JOIN matches m ON m.id = tm.match_id
  LEFT JOIN match_reports pr ON pr.tournament_match_id = tm.id AND pr.status = 'pending'
`;

interface TournamentMatchDbRow {
  id: number;
  tournament_id: number;
  round: number;
  position: number;
  player_a: string | null;
  player_b: string | null;
  match_id: number | null;
  score_a: number | null;
  score_b: number | null;
  pending_report_id: number | null;
  pending_reporter_id: string | null;
  pending_reporter_score: number | null;
  pending_opponent_score: number | null;
}

function toTournamentMatchRow(row: TournamentMatchDbRow): TournamentMatchRow {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    round: row.round,
    position: row.position,
    playerA: row.player_a,
    playerB: row.player_b,
    matchId: row.match_id,
    scoreA: row.score_a,
    scoreB: row.score_b,
    pendingReport:
      row.pending_report_id === null
        ? null
        : {
            id: row.pending_report_id,
            reporterId: row.pending_reporter_id!,
            reporterScore: row.pending_reporter_score!,
            opponentScore: row.pending_opponent_score!,
          },
  };
}

export function getTournamentMatch(id: number): TournamentMatchRow | undefined {
  const row = db.prepare(`${TOURNAMENT_MATCH_SELECT} WHERE tm.id = ?`).get(id) as unknown as TournamentMatchDbRow | undefined;
  return row && toTournamentMatchRow(row);
}

// By round, then position (schedule order; bracket top to bottom).
export function getTournamentMatches(tournamentId: number): TournamentMatchRow[] {
  const rows = db.prepare(`${TOURNAMENT_MATCH_SELECT} WHERE tm.tournament_id = ? ORDER BY tm.round, tm.position`).all(
    tournamentId,
  ) as unknown as TournamentMatchDbRow[];
  return rows.map(toTournamentMatchRow);
}

export function setTournamentMatchResult(tournamentMatchId: number, matchId: number): void {
  db.prepare("UPDATE tournament_matches SET match_id = ? WHERE id = ?").run(matchId, tournamentMatchId);
}

// A player's rating after each rated match, in rating order (for the profile chart). Tournament matches are rated when
// the tournament ends, so rating order can differ from match order; the chart must follow the rating order.
export function getRatingTimeline(playerId: string): { matchId: number; playedAt: string; rating: number }[] {
  const rows = db.prepare(`
    SELECT h.match_id, m.played_at, h.rating_after
    FROM rating_history h
    JOIN matches m ON m.id = h.match_id
    WHERE h.player_id = ?
    ORDER BY m.rating_order
  `).all(playerId) as { match_id: number; played_at: string; rating_after: number }[];
  return rows.map((row) => ({ matchId: row.match_id, playedAt: row.played_at, rating: row.rating_after }));
}

// One match as the activity feed shows it: both players, the score, and each player's rating change when rated.
export interface FeedMatchRow {
  matchId: number;
  playedAt: string;
  format: string;
  winner: { id: string; displayName: string; avatarUrl: string | null };
  loser: { id: string; displayName: string; avatarUrl: string | null };
  winnerGames: number;
  loserGames: number;
  ranked: boolean;
  winnerChange: number | null; // null: not rated (unranked, or a tournament that hasn't finished)
  loserChange: number | null;
  tournament: { id: number; name: string } | null;
}

// Everyone's matches, newest first (by id = confirmation order), with a cursor like getPlayerMatches.
export function getRecentMatches(filter: { limit?: number | undefined; before?: number | undefined } = {}): FeedMatchRow[] {
  const rows = db.prepare(`
    SELECT
      m.id, m.played_at, m.format, m.winner_games, m.loser_games, m.ranked,
      w.id AS winner_id, w.display_name AS winner_name, w.avatar_url AS winner_avatar,
      l.id AS loser_id, l.display_name AS loser_name, l.avatar_url AS loser_avatar,
      hw.rating_after - hw.rating_before AS winner_change,
      hl.rating_after - hl.rating_before AS loser_change,
      t.id AS tournament_id, t.name AS tournament_name
    FROM matches m
    JOIN players w ON w.id = m.winner_id
    JOIN players l ON l.id = m.loser_id
    LEFT JOIN rating_history hw ON hw.match_id = m.id AND hw.player_id = m.winner_id
    LEFT JOIN rating_history hl ON hl.match_id = m.id AND hl.player_id = m.loser_id
    LEFT JOIN tournament_matches tm ON tm.match_id = m.id
    LEFT JOIN tournaments t ON t.id = tm.tournament_id
    WHERE (:before IS NULL OR m.id < :before)
    ORDER BY m.id DESC
    LIMIT :limit
  `).all({ before: filter.before ?? null, limit: filter.limit ?? -1 }) as {
    id: number;
    played_at: string;
    format: string;
    winner_games: number;
    loser_games: number;
    ranked: number;
    winner_id: string;
    winner_name: string;
    winner_avatar: string | null;
    loser_id: string;
    loser_name: string;
    loser_avatar: string | null;
    winner_change: number | null;
    loser_change: number | null;
    tournament_id: number | null;
    tournament_name: string | null;
  }[];

  return rows.map((row) => ({
    matchId: row.id,
    playedAt: row.played_at,
    format: row.format,
    winner: { id: row.winner_id, displayName: row.winner_name, avatarUrl: row.winner_avatar },
    loser: { id: row.loser_id, displayName: row.loser_name, avatarUrl: row.loser_avatar },
    winnerGames: row.winner_games,
    loserGames: row.loser_games,
    ranked: row.ranked === 1,
    winnerChange: row.winner_change,
    loserChange: row.loser_change,
    tournament: row.tournament_id === null ? null : { id: row.tournament_id, name: row.tournament_name! },
  }));
}

// A player's tournament matches that are ready to play: active tournament, both players known, not played, nothing waiting.
export interface OpenTournamentMatchRow {
  tournamentMatchId: number;
  tournamentId: number;
  tournamentName: string;
  matchFormat: string;
  opponent: { id: string; displayName: string };
}

export function getOpenTournamentMatches(playerId: string): OpenTournamentMatchRow[] {
  const rows = db.prepare(`
    SELECT tm.id, t.id AS tournament_id, t.name, t.match_format, o.id AS opponent_id, o.display_name AS opponent_name
    FROM tournament_matches tm
    JOIN tournaments t ON t.id = tm.tournament_id
    JOIN players o ON o.id = CASE WHEN tm.player_a = :playerId THEN tm.player_b ELSE tm.player_a END
    WHERE t.status = 'active'
      AND tm.match_id IS NULL
      AND tm.player_a IS NOT NULL AND tm.player_b IS NOT NULL
      AND (tm.player_a = :playerId OR tm.player_b = :playerId)
      AND NOT EXISTS (SELECT 1 FROM match_reports r WHERE r.tournament_match_id = tm.id AND r.status = 'pending')
    ORDER BY t.id, tm.round, tm.position
  `).all({ playerId }) as {
    id: number;
    tournament_id: number;
    name: string;
    match_format: string;
    opponent_id: string;
    opponent_name: string;
  }[];
  return rows.map((row) => ({
    tournamentMatchId: row.id,
    tournamentId: row.tournament_id,
    tournamentName: row.name,
    matchFormat: row.match_format,
    opponent: { id: row.opponent_id, displayName: row.opponent_name },
  }));
}

// ---- Groups ----

export type GroupRole = "owner" | "member";

export interface GroupRow {
  id: number;
  name: string;
  inviteCode: string;
  memberCount: number;
}

export interface GroupMemberRow {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  role: GroupRole;
  joinedAt: string;
}

const GROUP_SELECT = `
  SELECT g.id, g.name, g.invite_code,
         (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count
  FROM groups g
`;

type GroupDbRow = { id: number; name: string; invite_code: string; member_count: number };

function toGroupRow(row: GroupDbRow): GroupRow {
  return { id: row.id, name: row.name, inviteCode: row.invite_code, memberCount: row.member_count };
}

export function insertGroup(name: string, inviteCode: string, createdAt: string): number {
  const result = db.prepare("INSERT INTO groups (name, invite_code, created_at) VALUES (?, ?, ?)").run(name, inviteCode, createdAt);
  return Number(result.lastInsertRowid);
}

export function getGroupById(id: number): GroupRow | undefined {
  const row = db.prepare(`${GROUP_SELECT} WHERE g.id = ?`).get(id) as GroupDbRow | undefined;
  return row && toGroupRow(row);
}

export function getGroupByInviteCode(inviteCode: string): GroupRow | undefined {
  const row = db.prepare(`${GROUP_SELECT} WHERE g.invite_code = ?`).get(inviteCode) as GroupDbRow | undefined;
  return row && toGroupRow(row);
}

// The groups a player is in, by name.
export function getGroupsOf(playerId: string): GroupRow[] {
  const rows = db.prepare(`
    ${GROUP_SELECT}
    WHERE g.id IN (SELECT group_id FROM group_members WHERE player_id = ?)
    ORDER BY g.name COLLATE NOCASE
  `).all(playerId) as GroupDbRow[];
  return rows.map(toGroupRow);
}

export function setGroupInviteCode(id: number, inviteCode: string): void {
  db.prepare("UPDATE groups SET invite_code = ? WHERE id = ?").run(inviteCode, id);
}

// Deletes the group; its memberships go with it (ON DELETE CASCADE).
export function deleteGroupRow(id: number): void {
  db.prepare("DELETE FROM groups WHERE id = ?").run(id);
}

export function insertGroupMember(groupId: number, playerId: string, role: GroupRole, joinedAt: string): void {
  db.prepare("INSERT INTO group_members (group_id, player_id, role, joined_at) VALUES (?, ?, ?, ?)").run(groupId, playerId, role, joinedAt);
}

// The player's role in the group, or undefined if they aren't a member.
export function getGroupRole(groupId: number, playerId: string): GroupRole | undefined {
  const row = db.prepare("SELECT role FROM group_members WHERE group_id = ? AND player_id = ?").get(groupId, playerId) as
    | { role: GroupRole }
    | undefined;
  return row?.role;
}

// Members in the order they joined (the first one is the longest-standing member).
export function getGroupMembers(groupId: number): GroupMemberRow[] {
  const rows = db.prepare(`
    SELECT gm.player_id, p.display_name, p.avatar_url, gm.role, gm.joined_at
    FROM group_members gm
    JOIN players p ON p.id = gm.player_id
    WHERE gm.group_id = ?
    ORDER BY gm.joined_at, gm.rowid
  `).all(groupId) as { player_id: string; display_name: string; avatar_url: string | null; role: GroupRole; joined_at: string }[];
  return rows.map((row) => ({
    playerId: row.player_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    joinedAt: row.joined_at,
  }));
}

export function setGroupRole(groupId: number, playerId: string, role: GroupRole): void {
  db.prepare("UPDATE group_members SET role = ? WHERE group_id = ? AND player_id = ?").run(role, groupId, playerId);
}

export function deleteGroupMember(groupId: number, playerId: string): void {
  db.prepare("DELETE FROM group_members WHERE group_id = ? AND player_id = ?").run(groupId, playerId);
}
