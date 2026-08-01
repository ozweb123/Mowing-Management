/**
 * Lawn CRUD + mapping between SQLite rows and domain types.
 */

import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import { NotFoundError } from "./errors";
import type { Lawn, LawnSize, ScheduleType, DogWarning } from "./types";
import type { LawnCreateInput } from "./validation";

type LawnRow = {
  id: string;
  name: string;
  address: string;
  city: string;
  notes: string;
  charge_cents: number;
  size: LawnSize;
  schedule_type: ScheduleType;
  interval_days: number | null;
  route_order: number;
  dog_warning: DogWarning;
  gate_code: string;
  active: number;
  created_at: string;
  updated_at: string;
};

export function rowToLawn(r: LawnRow): Lawn {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    city: r.city,
    notes: r.notes,
    chargeCents: r.charge_cents,
    size: r.size,
    scheduleType: r.schedule_type,
    intervalDays: r.interval_days,
    routeOrder: r.route_order,
    dogWarning: r.dog_warning,
    gateCode: r.gate_code,
    active: !!r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listLawns(includeInactive = false): Lawn[] {
  const db = getDb();
  const rows = includeInactive
    ? (db
        .prepare(`SELECT * FROM lawns ORDER BY route_order ASC, name ASC`)
        .all() as LawnRow[])
    : (db
        .prepare(
          `SELECT * FROM lawns WHERE active = 1 ORDER BY route_order ASC, name ASC`
        )
        .all() as LawnRow[]);
  return rows.map(rowToLawn);
}

export function getLawn(id: string): Lawn {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM lawns WHERE id = ?`).get(id) as
    | LawnRow
    | undefined;
  if (!row) throw new NotFoundError("Lawn not found.");
  return rowToLawn(row);
}

export function createLawn(input: LawnCreateInput): Lawn {
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();
  const chargeCents = Math.round(input.chargeDollars * 100);

  db.prepare(
    `INSERT INTO lawns (
      id, name, address, city, notes, charge_cents, size, schedule_type,
      interval_days, route_order, dog_warning, gate_code, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.address,
    input.city,
    input.notes,
    chargeCents,
    input.size,
    input.scheduleType,
    input.intervalDays ?? null,
    input.routeOrder,
    input.dogWarning,
    input.gateCode,
    input.active ? 1 : 0,
    now,
    now
  );

  return getLawn(id);
}

export function updateLawn(
  id: string,
  input: Partial<LawnCreateInput>
): Lawn {
  const existing = getLawn(id);
  const db = getDb();
  const now = new Date().toISOString();

  const name = input.name ?? existing.name;
  const address = input.address ?? existing.address;
  const city = input.city ?? existing.city;
  const notes = input.notes ?? existing.notes;
  const chargeCents =
    input.chargeDollars != null
      ? Math.round(input.chargeDollars * 100)
      : existing.chargeCents;
  const size = input.size ?? existing.size;
  const scheduleType = input.scheduleType ?? existing.scheduleType;
  const intervalDays =
    input.intervalDays !== undefined
      ? input.intervalDays
      : existing.intervalDays;
  const routeOrder = input.routeOrder ?? existing.routeOrder;
  const dogWarning = input.dogWarning ?? existing.dogWarning;
  const gateCode = input.gateCode ?? existing.gateCode;
  const active = input.active ?? existing.active;

  db.prepare(
    `UPDATE lawns SET
      name = ?, address = ?, city = ?, notes = ?, charge_cents = ?,
      size = ?, schedule_type = ?, interval_days = ?, route_order = ?,
      dog_warning = ?, gate_code = ?, active = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    name,
    address,
    city,
    notes,
    chargeCents,
    size,
    scheduleType,
    intervalDays,
    routeOrder,
    dogWarning,
    gateCode,
    active ? 1 : 0,
    now,
    id
  );

  return getLawn(id);
}

/** Soft-delete: deactivate so history stays intact. */
export function deactivateLawn(id: string): void {
  getLawn(id);
  const db = getDb();
  db.prepare(
    `UPDATE lawns SET active = 0, updated_at = ? WHERE id = ?`
  ).run(new Date().toISOString(), id);
}

/** Hard delete (only if no mowings, or cascade). */
export function deleteLawn(id: string): void {
  getLawn(id);
  const db = getDb();
  db.prepare(`DELETE FROM lawns WHERE id = ?`).run(id);
}

export function reorderLawns(orderedIds: string[]): void {
  const db = getDb();
  const upd = db.prepare(
    `UPDATE lawns SET route_order = ?, updated_at = ? WHERE id = ?`
  );
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    orderedIds.forEach((id, idx) => upd.run((idx + 1) * 10, now, id));
  });
  tx();
}
