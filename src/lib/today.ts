/**
 * Assembles the "Today" dashboard Miles opens at 7am.
 */

import { capacitySnapshot } from "./capacity";
import { forecastLawn, estimateMinutes, getSeason } from "./forecast";
import { listLawns } from "./lawns";
import { lastMowedAt } from "./mowings";
import { fetchWeatherForecast } from "./weather";
import { getDb } from "./db";
import type { DueStatus, TodayJob, WeatherDay } from "./types";

const DUE_RANK: Record<DueStatus, number> = {
  overdue: 0,
  due: 1,
  skip_rain: 2,
  due_soon: 3,
  ok: 4,
};

export async function buildTodayView() {
  ensureRainPushColumn();
  const weather = await fetchWeatherForecast();
  const lawns = listLawns(false);
  const settings = getDb()
    .prepare(
      `SELECT owner_name, gas_estimate_per_yard_cents, rain_push_until FROM settings WHERE id = 1`
    )
    .get() as {
    owner_name: string;
    gas_estimate_per_yard_cents: number;
    rain_push_until: string | null;
  };

  const rainPushActive =
    settings.rain_push_until != null &&
    new Date(settings.rain_push_until) > new Date();

  const jobs: TodayJob[] = lawns.map((lawn) => {
    let forecast = forecastLawn(lawn, lastMowedAt(lawn.id), weather);

    // Manual "Rain day — push all" override
    if (rainPushActive && ["due", "overdue", "due_soon"].includes(forecast.dueStatus)) {
      forecast = {
        ...forecast,
        dueStatus: "skip_rain",
        rainDelayDays: Math.max(forecast.rainDelayDays, 1),
        reason: forecast.reason + " Manual rain-day push active.",
      };
    }

    return {
      lawn,
      forecast,
      estimatedMinutes: estimateMinutes(lawn.size),
      distanceHint: lawn.address || lawn.city,
    };
  });

  // Sort by route order, but surface overdue/due first within similar bands
  jobs.sort((a, b) => {
    const rankDiff =
      DUE_RANK[a.forecast.dueStatus] - DUE_RANK[b.forecast.dueStatus];
    if (rankDiff !== 0 && (a.forecast.dueStatus === "overdue" || b.forecast.dueStatus === "overdue" || a.forecast.dueStatus === "due" || b.forecast.dueStatus === "due")) {
      // Keep route order primarily; only bubble overdue above ok
      if (
        (a.forecast.dueStatus === "overdue" || a.forecast.dueStatus === "due") !==
        (b.forecast.dueStatus === "overdue" || b.forecast.dueStatus === "due")
      ) {
        return rankDiff;
      }
    }
    return a.lawn.routeOrder - b.lawn.routeOrder;
  });

  const actionable = jobs.filter((j) =>
    ["due", "overdue", "due_soon"].includes(j.forecast.dueStatus)
  );
  // Also include adhoc never-mowed
  const adhocWaiting = jobs.filter(
    (j) =>
      j.lawn.scheduleType === "adhoc" &&
      j.forecast.lastMowedAt == null &&
      !actionable.includes(j)
  );
  const todayJobs = [...actionable, ...adhocWaiting];

  // If nothing due, still show top of route for planning
  const displayJobs = todayJobs.length ? todayJobs : jobs.slice(0, 4);

  const estCents = displayJobs
    .filter((j) => ["due", "overdue", "due_soon"].includes(j.forecast.dueStatus) || j.forecast.lastMowedAt == null)
    .reduce((s, j) => s + j.lawn.chargeCents, 0);

  const estMinutes = displayJobs
    .filter((j) => ["due", "overdue", "due_soon"].includes(j.forecast.dueStatus) || j.forecast.lastMowedAt == null)
    .reduce((s, j) => s + j.estimatedMinutes, 0);

  const gasCents =
    displayJobs.filter((j) =>
      ["due", "overdue", "due_soon"].includes(j.forecast.dueStatus)
    ).length * settings.gas_estimate_per_yard_cents;

  // Minutes that actually need doing today (not the "preview" filler yards)
  const scheduledMinutes = displayJobs
    .filter(
      (j) =>
        ["due", "overdue", "due_soon"].includes(j.forecast.dueStatus) ||
        (j.lawn.scheduleType === "adhoc" && !j.forecast.lastMowedAt)
    )
    .reduce((s, j) => s + j.estimatedMinutes, 0);

  const capacity = capacitySnapshot(scheduledMinutes);

  return {
    ownerName: settings.owner_name,
    season: getSeason(),
    weatherToday: weather[0] as WeatherDay | undefined,
    weather,
    jobs: displayJobs,
    allJobs: jobs,
    summary: {
      yardCount: displayJobs.filter((j) =>
        ["due", "overdue", "due_soon"].includes(j.forecast.dueStatus) ||
        (j.lawn.scheduleType === "adhoc" && !j.forecast.lastMowedAt)
      ).length,
      estimatedCents: estCents,
      estimatedMinutes: estMinutes,
      gasEstimateCents: gasCents,
    },
    capacity,
    rainPushUntil: settings.rain_push_until,
  };
}

/** Activate a rain-day push for N days from now. */
export function activateRainPush(days: number): string {
  const until = new Date();
  until.setDate(until.getDate() + days);
  until.setHours(23, 59, 59, 999);
  const iso = until.toISOString();
  // Column added via migrate — ensure exists
  ensureRainPushColumn();
  getDb()
    .prepare(`UPDATE settings SET rain_push_until = ? WHERE id = 1`)
    .run(iso);
  return iso;
}

export function clearRainPush(): void {
  ensureRainPushColumn();
  getDb()
    .prepare(`UPDATE settings SET rain_push_until = NULL WHERE id = 1`)
    .run();
}

function ensureRainPushColumn() {
  const db = getDb();
  const cols = db.prepare(`PRAGMA table_info(settings)`).all() as Array<{
    name: string;
  }>;
  if (!cols.some((c) => c.name === "rain_push_until")) {
    db.exec(`ALTER TABLE settings ADD COLUMN rain_push_until TEXT`);
  }
}
