// Password hashing and session tokens. Pure crypto from node:crypto, no database and no extra dependencies.
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// scrypt is deliberately slow and memory-hungry, so guessing passwords from a stolen hash is expensive.
// The callback version runs on Node's thread pool, so a login doesn't block other requests meanwhile.
// promisify turns it into a function that returns a Promise, so we can `await` it.
const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keyLength: number) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 64;

// Returns "scrypt$<salt>$<hash>" (hex). The random salt makes two equal passwords hash differently,
// so a precomputed table of common passwords is useless.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_BYTES);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

// Recomputes the hash with the stored salt and compares. timingSafeEqual takes the same time whether the first
// or the last byte differs, so response times don't leak how close a guess was.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) {
    return false;
  }
  const expected = Buffer.from(keyHex, "hex");
  // Invalid hex gives a short or empty buffer, and two empty buffers would compare as equal. Never accept that.
  if (expected.length !== KEY_BYTES) {
    return false;
  }
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

// Compares two secrets (e.g. an invite code) in constant time. timingSafeEqual needs equal-length inputs,
// so both are hashed first: same length always, and equal hashes mean equal strings.
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

// A group's invite code, the last part of its join link (/join/<code>). 9 random bytes = 72 bits: far too many to guess,
// and only 12 characters, so the link stays short enough to paste in a chat.
export function newInviteCode(): string {
  return randomBytes(9).toString("base64url");
}

// A new random session token, sent to the browser in a cookie. 32 random bytes can't be guessed.
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

// Only this hash is stored in the database. Someone who reads the database can't log in with it,
// because the cookie must hold the token itself. A fast hash is fine here: the token is random, not a password.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
