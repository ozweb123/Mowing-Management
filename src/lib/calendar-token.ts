/**
 * Secret token for the public ICS subscribe feed (no session cookie).
 * iOS Calendar fetches this URL periodically for schedule updates.
 */

import { randomBytes } from "crypto";
import { getDb } from "./db";

function ensureColumn() {
  const db = getDb();
  const cols = db.prepare(`PRAGMA table_info(settings)`).all() as Array<{
    name: string;
  }>;
  if (!cols.some((c) => c.name === "calendar_token")) {
    db.exec(`ALTER TABLE settings ADD COLUMN calendar_token TEXT`);
  }
}

export function getCalendarToken(): string {
  ensureColumn();
  const db = getDb();
  const row = db
    .prepare(`SELECT calendar_token FROM settings WHERE id = 1`)
    .get() as { calendar_token: string | null } | undefined;
  if (row?.calendar_token) return row.calendar_token;
  const token = randomBytes(24).toString("base64url");
  db.prepare(`UPDATE settings SET calendar_token = ? WHERE id = 1`).run(token);
  return token;
}

export function rotateCalendarToken(): string {
  ensureColumn();
  const token = randomBytes(24).toString("base64url");
  getDb()
    .prepare(`UPDATE settings SET calendar_token = ? WHERE id = 1`)
    .run(token);
  return token;
}

export function assertCalendarToken(provided: string | null): boolean {
  if (!provided) return false;
  const expected = getCalendarToken();
  // timing-safe-ish compare
  if (provided.length !== expected.length) return false;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    ok |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return ok === 0;
}
