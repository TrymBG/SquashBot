// Business logic for website accounts: sign up (with an invite code), log in, log out, and "who is this session".
// Returns plain data, like the other services. The API layer turns it into status codes and cookies.
import { randomUUID } from "node:crypto";
import {
  deleteExpiredSessions,
  deleteSession,
  deleteSessionsForUser,
  getPasswordReset,
  getAllUsers,
  getSession,
  getUserByEmail,
  getUserById,
  getUserByPlayerId,
  insertSession,
  insertUser,
  markPasswordResetUsed,
  replacePasswordReset,
  transaction,
  updatePasswordHash,
  upsertPlayer,
  type UserRow,
} from "../db.js";
import { STARTING_RATING } from "../elo.js";
import { hashPassword, hashToken, newSessionToken, safeEqual, verifyPassword } from "../passwords.js";

export const SESSION_DAYS = 30;
export const RESET_LINK_MINUTES = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

// What the rest of the app may see about a user. No password hash.
export interface PublicUser {
  id: string;
  email: string;
  playerId: string;
  displayName: string;
}

export interface SignupInput {
  email: string;
  password: string;
  displayName: string;
  inviteCode: string;
}

// A string union works like a small Java enum: the compiler checks every reason is handled.
export type SignupResult =
  | { ok: true; user: PublicUser; sessionToken: string }
  | { ok: false; reason: "signup-closed" | "invalid-invite" | "email-taken" };

export type LoginResult = { ok: true; user: PublicUser; sessionToken: string } | { ok: false };

// Creates a player and an account linked to it, and logs the new user in.
// `expectedInviteCode` comes from config (null = sign-up closed); passing it in keeps this testable.
// `now` is a parameter so tests can control time, like injecting a Clock in Java.
export async function signup(input: SignupInput, expectedInviteCode: string | null, now = new Date()): Promise<SignupResult> {
  if (expectedInviteCode === null) {
    return { ok: false, reason: "signup-closed" };
  }
  if (!safeEqual(input.inviteCode, expectedInviteCode)) {
    return { ok: false, reason: "invalid-invite" };
  }

  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  // Hash before the transaction: transaction() is synchronous, so nothing inside it may be awaited.
  const passwordHash = await hashPassword(input.password);

  return transaction((): SignupResult => {
    // Checked inside the transaction, so no other sign-up can take the email in between.
    if (getUserByEmail(email)) {
      return { ok: false, reason: "email-taken" };
    }
    const playerId = randomUUID();
    const userId = randomUUID();
    upsertPlayer(playerId, displayName, null, STARTING_RATING);
    insertUser(userId, email, passwordHash, playerId);
    const sessionToken = createSession(userId, now);
    return { ok: true, user: { id: userId, email, playerId, displayName }, sessionToken };
  });
}

// A real hash of a throwaway password, so a login with an unknown email does the same slow work as a real one.
// Otherwise the faster "no such user" answer would reveal which emails have accounts.
const dummyHash = hashPassword("not-a-real-password");

export async function login(email: string, password: string, now = new Date()): Promise<LoginResult> {
  const user = getUserByEmail(normalizeEmail(email));
  const passwordOk = await verifyPassword(password, user ? user.passwordHash : await dummyHash);
  if (!user || !passwordOk) {
    return { ok: false };
  }
  deleteExpiredSessions(now.toISOString()); // a cheap moment to clean up old sessions
  return { ok: true, user: toPublicUser(user), sessionToken: createSession(user.id, now) };
}

// Dev only (api/devRoutes.ts, never registered in production): every account, and logging in as one without a password.
export function listAccounts(): PublicUser[] {
  return getAllUsers().map(toPublicUser);
}

export function devLoginAs(playerId: string, now = new Date()): { user: PublicUser; sessionToken: string } | undefined {
  const user = getUserByPlayerId(playerId);
  return user && { user: toPublicUser(user), sessionToken: createSession(user.id, now) };
}

export type ResetResult = { ok: true; user: PublicUser; sessionToken: string } | { ok: false };

// Makes a one-time reset link token for the account with this email (the admin runs this, see resetLink.ts),
// or undefined if no account has that email. Works like a session token: random, only its hash is stored.
// Valid for RESET_LINK_MINUTES and only once; a new link replaces the user's older ones.
export function createPasswordReset(email: string, now = new Date()): string | undefined {
  const user = getUserByEmail(normalizeEmail(email));
  if (!user) {
    return undefined;
  }
  const token = newSessionToken();
  const expiresAt = new Date(now.getTime() + RESET_LINK_MINUTES * 60 * 1000).toISOString();
  replacePasswordReset(hashToken(token), user.id, expiresAt);
  return token;
}

// Sets a new password with a reset link token. Logs the user out everywhere (an attacker who knew the old password
// loses their session too) and logs them in here with a new session.
export async function resetPassword(token: string, newPassword: string, now = new Date()): Promise<ResetResult> {
  const tokenHash = hashToken(token);
  const reset = getPasswordReset(tokenHash);
  if (!reset || reset.usedAt !== null || reset.expiresAt <= now.toISOString()) {
    return { ok: false };
  }
  // Hash before the transaction: transaction() is synchronous, so nothing inside it may be awaited.
  const passwordHash = await hashPassword(newPassword);

  return transaction((): ResetResult => {
    // Marking it used is the real check: only one request can flip used_at from NULL, so a link works only once
    // even if two requests arrive at the same time.
    if (!markPasswordResetUsed(tokenHash, now.toISOString())) {
      return { ok: false };
    }
    updatePasswordHash(reset.userId, passwordHash);
    deleteSessionsForUser(reset.userId);
    const user = getUserById(reset.userId)!; // the reset row cascades with the user, so the user exists
    return { ok: true, user: toPublicUser(user), sessionToken: createSession(user.id, now) };
  });
}

export function logout(sessionToken: string): void {
  deleteSession(hashToken(sessionToken));
}

// The user a session cookie belongs to, or undefined if it's missing, unknown or expired.
export function getUserForSession(sessionToken: string | undefined, now = new Date()): PublicUser | undefined {
  if (!sessionToken) {
    return undefined;
  }
  const tokenHash = hashToken(sessionToken);
  const session = getSession(tokenHash);
  if (!session) {
    return undefined;
  }
  if (session.expiresAt <= now.toISOString()) {
    deleteSession(tokenHash);
    return undefined;
  }
  const user = getUserById(session.userId);
  return user && toPublicUser(user);
}

// Stores a new session (only the token's hash) and returns the token for the cookie.
function createSession(userId: string, now: Date): string {
  const token = newSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString();
  insertSession(hashToken(token), userId, expiresAt);
  return token;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublicUser(user: UserRow): PublicUser {
  return { id: user.id, email: user.email, playerId: user.playerId, displayName: user.displayName };
}
