/**
 * Mowing history + payment status helpers.
 */

import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import { NotFoundError } from "./errors";
import { getLawn } from "./lawns";
import type { MowingRecord, PaymentStatus } from "./types";
import type { MowingCreateInput } from "./validation";

type MowRow = {
  id: string;
  lawn_id: string;
  mowed_at: string;
  duration_minutes: number | null;
  notes: string;
  weather_summary: string;
  amount_cents: number;
  payment_status: PaymentStatus;
  paid_at: string | null;
  created_at: string;
};

export function rowToMowing(r: MowRow): MowingRecord {
  return {
    id: r.id,
    lawnId: r.lawn_id,
    mowedAt: r.mowed_at,
    durationMinutes: r.duration_minutes,
    notes: r.notes,
    weatherSummary: r.weather_summary,
    amountCents: r.amount_cents,
    paymentStatus: r.payment_status,
    paidAt: r.paid_at,
    createdAt: r.created_at,
  };
}

export function listMowings(opts?: {
  lawnId?: string;
  limit?: number;
}): MowingRecord[] {
  const db = getDb();
  const limit = opts?.limit ?? 100;
  if (opts?.lawnId) {
    const rows = db
      .prepare(
        `SELECT * FROM mowings WHERE lawn_id = ? ORDER BY mowed_at DESC LIMIT ?`
      )
      .all(opts.lawnId, limit) as MowRow[];
    return rows.map(rowToMowing);
  }
  const rows = db
    .prepare(`SELECT * FROM mowings ORDER BY mowed_at DESC LIMIT ?`)
    .all(limit) as MowRow[];
  return rows.map(rowToMowing);
}

export function lastMowedAt(lawnId: string): string | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT mowed_at FROM mowings WHERE lawn_id = ? ORDER BY mowed_at DESC LIMIT 1`
    )
    .get(lawnId) as { mowed_at: string } | undefined;
  return row?.mowed_at ?? null;
}

export function createMowing(input: MowingCreateInput): MowingRecord {
  const lawn = getLawn(input.lawnId);
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();
  const mowedAt = input.mowedAt ?? now;
  const amount = input.amountCents ?? lawn.chargeCents;
  const paidAt =
    input.paymentStatus === "paid" ? mowedAt : null;

  db.prepare(
    `INSERT INTO mowings (
      id, lawn_id, mowed_at, duration_minutes, notes, weather_summary,
      amount_cents, payment_status, paid_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.lawnId,
    mowedAt,
    input.durationMinutes ?? null,
    input.notes ?? "",
    input.weatherSummary ?? "",
    amount,
    input.paymentStatus,
    paidAt,
    now
  );

  // Clear any week-planner pin once the yard is actually done.
  try {
    db.prepare(
      `UPDATE lawns SET planned_mow_date = NULL, updated_at = ? WHERE id = ?`
    ).run(now, input.lawnId);
  } catch {
    // Column may not exist yet on ancient DBs — week.ts migrates it.
  }

  return getMowing(id);
}

export function getMowing(id: string): MowingRecord {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM mowings WHERE id = ?`).get(id) as
    | MowRow
    | undefined;
  if (!row) throw new NotFoundError("Mowing record not found.");
  return rowToMowing(row);
}

export function updatePayment(
  id: string,
  status: PaymentStatus,
  paidAt?: string | null
): MowingRecord {
  getMowing(id);
  const db = getDb();
  const resolvedPaidAt =
    status === "paid"
      ? paidAt ?? new Date().toISOString()
      : status === "owes"
        ? null
        : paidAt ?? null;

  db.prepare(
    `UPDATE mowings SET payment_status = ?, paid_at = ? WHERE id = ?`
  ).run(status, resolvedPaidAt, id);

  return getMowing(id);
}

export function deleteMowing(id: string): void {
  getMowing(id);
  getDb().prepare(`DELETE FROM mowings WHERE id = ?`).run(id);
}

/**
 * "Rain day — push all 1 day": record a note on each due lawn without
 * marking mowed; forecast already uses weather. We bump route by storing
 * a synthetic last-touch via interval override… Better approach for Miles:
 * add one day to each lawn's interval temporarily is confusing.
 *
 * Practical approach: insert a lightweight schedule_shift note in settings
 * OR update each lawn's last conceptual due by appending a rain-skip mowing
 * marker. Simplest UX: store rain_push_until in settings.
 *
 * For v1 we add rain_skip rows as zero-amount notes? No — that pollutes history.
 * Instead: bump each active lawn's interval_days by +days once (capped),
 * and rely on weather engine for mud delay. Actually Miles wants "push all 1 day"
 * meaning don't mow today — weather skip_rain already covers that.
 *
 * We'll expose pushRainDay as updating a settings timestamp rain_push_until.
 */
