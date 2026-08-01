/**
 * Weather-week planner — place due yards into dry windows across the next 7 days.
 * Browser-only planning view (no PWA / offline).
 */

import { availableMinutesForDate, getCapacitySettings } from "./capacity";
import { estimateMinutes, forecastLawn, getSeason } from "./forecast";
import { listLawns } from "./lawns";
import { getDb } from "./db";
import { lastMowedAt } from "./mowings";
import { fetchWeatherForecast } from "./weather";
import type { Lawn, LawnForecast, WeatherDay } from "./types";

export type WeekJob = {
  lawn: Lawn;
  forecast: LawnForecast;
  estimatedMinutes: number;
  /** Day this yard is planned for (due date or manual plan). */
  plannedDate: string;
  /** Why we put it here / whether weather is sketchy. */
  fit: "good" | "ok" | "risky";
  fitNote: string;
};

export type WeekDay = {
  date: string;
  weekday: string;
  isToday: boolean;
  weather?: WeatherDay;
  rainRisk: number;
  severe: boolean;
  availableMinutes: number;
  scheduledMinutes: number;
  overbooked: boolean;
  blockedLabels: string[];
  jobs: WeekJob[];
  /** Dry-window tip for this day. */
  tip: string | null;
};

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDate(s: string): Date {
  return new Date(s + "T12:00:00");
}

function rainRiskForDay(day?: WeatherDay): number {
  if (!day) return 0;
  return Math.max(
    0,
    ...day.periods.map((p) => p.precipProbability ?? 0)
  );
}

function morningRain(day?: WeatherDay): number {
  return (
    day?.periods.find((p) => p.label === "morning")?.precipProbability ?? 0
  );
}

function ensurePlannedColumn() {
  const db = getDb();
  const cols = db.prepare(`PRAGMA table_info(lawns)`).all() as Array<{
    name: string;
  }>;
  if (!cols.some((c) => c.name === "planned_mow_date")) {
    db.exec(`ALTER TABLE lawns ADD COLUMN planned_mow_date TEXT`);
  }
}

export function getPlannedMowDate(lawnId: string): string | null {
  ensurePlannedColumn();
  const row = getDb()
    .prepare(`SELECT planned_mow_date FROM lawns WHERE id = ?`)
    .get(lawnId) as { planned_mow_date: string | null } | undefined;
  return row?.planned_mow_date ?? null;
}

export function setPlannedMowDate(
  lawnId: string,
  date: string | null
): void {
  ensurePlannedColumn();
  getDb()
    .prepare(
      `UPDATE lawns SET planned_mow_date = ?, updated_at = ? WHERE id = ?`
    )
    .run(date, new Date().toISOString(), lawnId);
}

function scoreFit(
  day: WeatherDay | undefined,
  severe: boolean
): { fit: WeekJob["fit"]; fitNote: string } {
  if (severe || day?.severeFlag) {
    return { fit: "risky", fitNote: "Severe weather — skip if you can" };
  }
  const risk = rainRiskForDay(day);
  const am = morningRain(day);
  if (risk >= 60 || am >= 50) {
    return {
      fit: "risky",
      fitNote: `Rain ${risk}% — muddy or washout risk`,
    };
  }
  if (risk >= 35 || am >= 30) {
    return {
      fit: "ok",
      fitNote: `Some rain risk (${risk}%) — watch the morning`,
    };
  }
  return { fit: "good", fitNote: `Dry window · rain ${risk}%` };
}

/**
 * Suggest a better day when the natural due date is wet.
 * Prefers morning-dry days within ±2 days of due, capacity permitting.
 */
function suggestBetterDay(
  dueDate: string,
  weather: WeatherDay[],
  loadByDate: Map<string, number>,
  jobMinutes: number,
  capacity: ReturnType<typeof getCapacitySettings>
): { date: string; note: string } | null {
  const dueIdx = weather.findIndex((d) => d.date === dueDate);
  if (dueIdx < 0) return null;

  const dueDay = weather[dueIdx];
  const dueRisk = rainRiskForDay(dueDay);
  if (dueRisk < 45 && !dueDay.severeFlag) return null;

  const candidates: Array<{ date: string; score: number; note: string }> = [];
  for (let i = Math.max(0, dueIdx - 1); i <= Math.min(weather.length - 1, dueIdx + 3); i++) {
    if (i === dueIdx) continue;
    const d = weather[i];
    const risk = rainRiskForDay(d);
    if (d.severeFlag || risk >= 55) continue;
    const avail = availableMinutesForDate(parseDate(d.date), capacity);
    const load = loadByDate.get(d.date) ?? 0;
    if (load + jobMinutes > avail.availableMinutes) continue;

    // Prefer lower rain, prefer earlier if overdue-ish
    const score = risk + Math.abs(i - dueIdx) * 5 + (load / Math.max(1, avail.availableMinutes)) * 10;
    candidates.push({
      date: d.date,
      score,
      note: `Better than ${dueDate.slice(5)} — rain ${risk}% (was ${dueRisk}%)`,
    });
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]
    ? { date: candidates[0].date, note: candidates[0].note }
    : null;
}

export async function buildWeekView(daysCount = 7) {
  ensurePlannedColumn();
  const weather = await fetchWeatherForecast();
  const capacity = getCapacitySettings();
  const lawns = listLawns(false);
  const today = dateStr(new Date());
  const slice = weather.slice(0, daysCount);

  type Pending = {
    lawn: Lawn;
    forecast: LawnForecast;
    estimatedMinutes: number;
    targetDate: string;
  };

  const pending: Pending[] = lawns.map((lawn) => {
    const forecast = forecastLawn(lawn, lastMowedAt(lawn.id), weather);
    const planned = getPlannedMowDate(lawn.id);
    // Manual plan wins; else natural next due (clamp into window if far out)
    let targetDate = planned || forecast.nextDueDate;
    if (targetDate < today) targetDate = today;
    // If due beyond the week window, still show on last day as "later" only if soon
    const last = slice[slice.length - 1]?.date;
    if (last && targetDate > last) {
      // Keep off the week board unless overdue/due_soon
      if (!["overdue", "due", "due_soon"].includes(forecast.dueStatus) && !planned) {
        targetDate = ""; // exclude from week columns
      } else {
        targetDate = last;
      }
    }
    return {
      lawn,
      forecast,
      estimatedMinutes: estimateMinutes(lawn.size),
      targetDate,
    };
  });

  // First pass load for suggestion capacity checks
  const loadByDate = new Map<string, number>();
  for (const p of pending) {
    if (!p.targetDate) continue;
    loadByDate.set(
      p.targetDate,
      (loadByDate.get(p.targetDate) ?? 0) + p.estimatedMinutes
    );
  }

  const suggestions: Array<{
    lawnId: string;
    lawnName: string;
    fromDate: string;
    toDate: string;
    note: string;
  }> = [];

  // Apply auto-suggestions into a display assignment (doesn't persist unless Miles accepts)
  const assignment = new Map<string, string>(); // lawnId -> date
  for (const p of pending) {
    if (!p.targetDate) continue;
    const planned = getPlannedMowDate(p.lawn.id);
    if (planned) {
      assignment.set(p.lawn.id, planned);
      continue;
    }
    const better = suggestBetterDay(
      p.targetDate,
      slice,
      loadByDate,
      p.estimatedMinutes,
      capacity
    );
    if (better) {
      suggestions.push({
        lawnId: p.lawn.id,
        lawnName: p.lawn.name,
        fromDate: p.targetDate,
        toDate: better.date,
        note: better.note,
      });
      // Show on suggested day in the planner preview
      assignment.set(p.lawn.id, better.date);
      // Adjust loads for subsequent suggestions
      loadByDate.set(
        p.targetDate,
        Math.max(0, (loadByDate.get(p.targetDate) ?? 0) - p.estimatedMinutes)
      );
      loadByDate.set(
        better.date,
        (loadByDate.get(better.date) ?? 0) + p.estimatedMinutes
      );
    } else {
      assignment.set(p.lawn.id, p.targetDate);
    }
  }

  const weekDays: WeekDay[] = slice.map((wDay) => {
    const cap = availableMinutesForDate(parseDate(wDay.date), capacity);
    const jobs: WeekJob[] = pending
      .filter((p) => assignment.get(p.lawn.id) === wDay.date)
      .map((p) => {
        const { fit, fitNote } = scoreFit(wDay, wDay.severeFlag);
        const planned = getPlannedMowDate(p.lawn.id);
        return {
          lawn: p.lawn,
          forecast: p.forecast,
          estimatedMinutes: p.estimatedMinutes,
          plannedDate: wDay.date,
          fit,
          fitNote: planned
            ? `Pinned by you · ${fitNote}`
            : fitNote,
        };
      })
      .sort((a, b) => a.lawn.routeOrder - b.lawn.routeOrder);

    const scheduledMinutes = jobs.reduce(
      (s, j) => s + j.estimatedMinutes,
      0
    );
    const risk = rainRiskForDay(wDay);

    let tip: string | null = null;
    if (wDay.severeFlag) tip = "Unsafe mowing day — replan.";
    else if (risk >= 60) tip = "Heavy rain risk — keep this day light.";
    else if (scheduledMinutes > cap.availableMinutes)
      tip = "Overbooked vs school/sports blocks — move a yard.";
    else if (risk <= 20 && scheduledMinutes === 0 && cap.availableMinutes >= 60)
      tip = "Open dry day — good catch-up slot.";

    return {
      date: wDay.date,
      weekday: parseDate(wDay.date).toLocaleDateString(undefined, {
        weekday: "short",
      }),
      isToday: wDay.date === today,
      weather: wDay,
      rainRisk: risk,
      severe: wDay.severeFlag,
      availableMinutes: cap.availableMinutes,
      scheduledMinutes,
      overbooked: scheduledMinutes > cap.availableMinutes,
      blockedLabels: cap.blockedLabels,
      jobs,
      tip,
    };
  });

  return {
    season: getSeason(),
    capacity,
    days: weekDays,
    suggestions,
  };
}
