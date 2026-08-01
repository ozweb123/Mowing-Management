/**
 * Session auth with httpOnly cookies + hashed tokens in SQLite.
 * PIN-based login (teen-friendly) with bcrypt hashing and rate limits at the route layer.
 */

import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import { UnauthorizedError } from "./errors";

const COOKIE_NAME = "mmm_session";
const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function requireSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set (min 32 characters).");
  }
  return secret;
}

/** Create a new session and return the raw cookie token. */
export function createSession(): string {
  requireSessionSecret();
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token + requireSessionSecret());
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  db.prepare(
    `INSERT INTO sessions (id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)`
  ).run(uuid(), tokenHash, now.toISOString(), expires.toISOString());

  // Opportunistic cleanup of expired sessions.
  db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(now.toISOString());

  return token;
}

/** Validate cookie session; throws UnauthorizedError if invalid. */
export async function requireAuth(): Promise<{ sessionId: string }> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) throw new UnauthorizedError();

  const db = getDb();
  const tokenHash = hashToken(token + requireSessionSecret());
  const row = db
    .prepare(
      `SELECT id, expires_at FROM sessions WHERE token_hash = ?`
    )
    .get(tokenHash) as { id: string; expires_at: string } | undefined;

  if (!row) throw new UnauthorizedError();
  if (new Date(row.expires_at) < new Date()) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(row.id);
    throw new UnauthorizedError("Session expired — sign in again.");
  }

  return { sessionId: row.id };
}

/** Soft check — returns false instead of throwing. */
export async function isAuthenticated(): Promise<boolean> {
  try {
    await requireAuth();
    return true;
  } catch {
    return false;
  }
}

export function verifyPin(pin: string): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT pin_hash FROM settings WHERE id = 1`)
    .get() as { pin_hash: string } | undefined;
  if (!row) return false;
  // Constant-time-ish compare via bcrypt.
  return bcrypt.compareSync(pin, row.pin_hash);
}

export function updatePin(newPin: string): void {
  const db = getDb();
  const hash = bcrypt.hashSync(newPin, 12);
  db.prepare(`UPDATE settings SET pin_hash = ? WHERE id = 1`).run(hash);
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return;
  const db = getDb();
  const tokenHash = hashToken(token + requireSessionSecret());
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
}

export function sessionCookieOptions(maxAgeSec: number) {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

export { COOKIE_NAME, SESSION_DAYS };
