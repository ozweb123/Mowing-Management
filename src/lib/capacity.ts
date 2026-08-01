/**
 * School/sports capacity — how many mowing minutes Miles actually has in a day.
 * Work window minus blocked blocks (practice, games, dinner with parents, etc.).
 */

import { getDb } from "./db";
import { type BlockedSlot, fmtHour } from "./capacity-shared";

export type { BlockedSlot } from "./capacity-shared";
export { dowName, fmtHour } from "./capacity-shared";

export type CapacitySettings = {
  availableStartHour: number;
  availableEndHour: number;
  blocked: BlockedSlot[];
};

export function ensureCapacityColumns() {
  const db = getDb();
  const cols = db.prepare(`PRAGMA table_info(settings)`).all() as Array<{
    name: string;
  }>;
  if (!cols.some((c) => c.name === "available_start_hour")) {
    db.exec(
      `ALTER TABLE settings ADD COLUMN available_start_hour INTEGER NOT NULL DEFAULT 8`
    );
  }
  if (!cols.some((c) => c.name === "available_end_hour")) {
    db.exec(
      `ALTER TABLE settings ADD COLUMN available_end_hour INTEGER NOT NULL DEFAULT 18`
    );
  }
  if (!cols.some((c) => c.name === "blocked_json")) {
    // Seed a sample Tue/Thu after-school block — Miles can edit/clear.
    db.exec(
      `ALTER TABLE settings ADD COLUMN blocked_json TEXT NOT NULL DEFAULT '[{"dow":2,"startHour":15,"endHour":19,"label":"After school / practice"},{"dow":4,"startHour":15,"endHour":19,"label":"After school / practice"}]'`
    );
  }
}

export function getCapacitySettings(): CapacitySettings {
  ensureCapacityColumns();
  const row = getDb()
    .prepare(
      `SELECT available_start_hour, available_end_hour, blocked_json
       FROM settings WHERE id = 1`
    )
    .get() as {
    available_start_hour: number;
    available_end_hour: number;
    blocked_json: string;
  };

  let blocked: BlockedSlot[] = [];
  try {
    const parsed = JSON.parse(row.blocked_json || "[]") as unknown;
    if (Array.isArray(parsed)) {
      blocked = parsed
        .filter(
          (b): b is BlockedSlot =>
            !!b &&
            typeof b === "object" &&
            typeof (b as BlockedSlot).dow === "number" &&
            typeof (b as BlockedSlot).startHour === "number" &&
            typeof (b as BlockedSlot).endHour === "number"
        )
        .map((b) => ({
          dow: b.dow,
          startHour: b.startHour,
          endHour: b.endHour,
          label: String(b.label || "Blocked").slice(0, 60),
        }));
    }
  } catch {
    blocked = [];
  }

  return {
    availableStartHour: row.available_start_hour,
    availableEndHour: row.available_end_hour,
    blocked,
  };
}

export function saveCapacitySettings(input: {
  availableStartHour?: number;
  availableEndHour?: number;
  blocked?: BlockedSlot[];
}): CapacitySettings {
  ensureCapacityColumns();
  const current = getCapacitySettings();
  const next: CapacitySettings = {
    availableStartHour:
      input.availableStartHour ?? current.availableStartHour,
    availableEndHour: input.availableEndHour ?? current.availableEndHour,
    blocked: input.blocked ?? current.blocked,
  };

  // Guard: end after start
  if (next.availableEndHour <= next.availableStartHour) {
    next.availableEndHour = Math.min(22, next.availableStartHour + 4);
  }

  getDb()
    .prepare(
      `UPDATE settings SET
        available_start_hour = ?,
        available_end_hour = ?,
        blocked_json = ?
       WHERE id = 1`
    )
    .run(
      next.availableStartHour,
      next.availableEndHour,
      JSON.stringify(next.blocked)
    );

  return next;
}

/**
 * Available mowing minutes for a calendar date (local).
 * Overlaps blocked slots with the work window and subtracts them.
 */
export function availableMinutesForDate(
  date: Date,
  settings: CapacitySettings = getCapacitySettings()
): {
  availableMinutes: number;
  blockedMinutes: number;
  windowMinutes: number;
  blockedLabels: string[];
} {
  const dow = date.getDay();
  const start = settings.availableStartHour;
  const end = settings.availableEndHour;
  const windowMinutes = Math.max(0, (end - start) * 60);

  let blockedMinutes = 0;
  const blockedLabels: string[] = [];

  for (const slot of settings.blocked) {
    if (slot.dow !== dow) continue;
    const overlapStart = Math.max(start, slot.startHour);
    const overlapEnd = Math.min(end, slot.endHour);
    if (overlapEnd > overlapStart) {
      blockedMinutes += (overlapEnd - overlapStart) * 60;
      blockedLabels.push(
        `${slot.label} (${fmtHour(slot.startHour)}–${fmtHour(slot.endHour)})`
      );
    }
  }

  return {
    availableMinutes: Math.max(0, windowMinutes - blockedMinutes),
    blockedMinutes,
    windowMinutes,
    blockedLabels,
  };
}

/** Capacity snapshot for Today UI. */
export function capacitySnapshot(scheduledMinutes: number, date = new Date()) {
  const settings = getCapacitySettings();
  const day = availableMinutesForDate(date, settings);
  const overbooked = scheduledMinutes > day.availableMinutes;
  const ratio =
    day.availableMinutes > 0
      ? Math.min(1.5, scheduledMinutes / day.availableMinutes)
      : scheduledMinutes > 0
        ? 1.5
        : 0;

  return {
    ...day,
    settings,
    scheduledMinutes,
    remainingMinutes: day.availableMinutes - scheduledMinutes,
    overbooked,
    fillPercent: Math.round(Math.min(100, ratio * 100)),
    workWindowLabel: `${fmtHour(settings.availableStartHour)}–${fmtHour(settings.availableEndHour)}`,
  };
}
