/**
 * Next-mow forecasting for Southwest Topeka, KS.
 *
 * Seasonal baseline intervals (Miles' experience):
 *  - Spring (Mar–May): ~6 days (fast growth + rain)
 *  - Early summer (Jun–mid Jul): ~7 days
 *  - Late summer (mid Jul–Sep): 10–12 days when dry; shorter if rainy
 *
 * Rain adjustments:
 *  - Recent heavy rain → delay mowing (mud / "wait 24h" nudge)
 *  - Wet weeks → shorten interval (grass grows faster)
 *  - Dry stretches in late summer → stretch toward 12 days
 */

import type { DueStatus, Lawn, LawnForecast, WeatherDay } from "./types";

export type Season = "spring" | "early_summer" | "late_summer" | "off_season";

/** Determine season band from a calendar date (local Topeka). */
export function getSeason(date: Date = new Date()): Season {
  const month = date.getMonth() + 1; // 1–12
  const day = date.getDate();

  if (month >= 3 && month <= 5) return "spring";
  if (month === 6 || (month === 7 && day < 15)) return "early_summer";
  if ((month === 7 && day >= 15) || month === 8 || month === 9) {
    return "late_summer";
  }
  // Oct–Feb: still mow occasionally but longer gaps
  return "off_season";
}

export function baseIntervalForSeason(season: Season): number {
  switch (season) {
    case "spring":
      return 6;
    case "early_summer":
      return 7;
    case "late_summer":
      return 11; // midpoint of 10–12; rain/dry will nudge
    case "off_season":
      return 14;
  }
}

/** Sum precip inches over the last N complete days from weather history/forecast. */
export function recentPrecipInches(
  days: WeatherDay[],
  lookbackDays: number
): number {
  const slice = days.slice(0, lookbackDays);
  return slice.reduce((sum, d) => {
    const dayTotal = d.periods.reduce(
      (s, p) => s + (p.precipInches ?? 0),
      0
    );
    return sum + dayTotal;
  }, 0);
}

/**
 * Compute recommended interval + due date for one lawn.
 * @param lawn lawn record (intervalDays override wins when set)
 * @param lastMowedAt ISO string or null
 * @param weather upcoming + recent days (index 0 ≈ today)
 */
export function forecastLawn(
  lawn: Lawn,
  lastMowedAt: string | null,
  weather: WeatherDay[],
  now: Date = new Date()
): LawnForecast {
  const season = getSeason(now);
  // Per-lawn override wins as a floor/ceiling Miles set himself.
  const hasCustomInterval = lawn.intervalDays != null;
  let interval = hasCustomInterval
    ? (lawn.intervalDays as number)
    : baseIntervalForSeason(season);

  const precip7 = recentPrecipInches(weather, 7);
  const precip1 = recentPrecipInches(weather.slice(0, 1), 1);
  const precipTodayNightOrMorning =
    (weather[0]?.periods.find((p) => p.label === "night")?.precipInches ?? 0) +
    (weather[0]?.periods.find((p) => p.label === "morning")?.precipInches ?? 0);

  let rainDelayDays = 0;
  let reasonParts: string[] = [];

  if (hasCustomInterval) {
    reasonParts.push(`Custom interval — every ${interval} days`);
  } else {
    reasonParts.push(
      season === "spring"
        ? "Spring growth — aim ~every 6 days"
        : season === "early_summer"
          ? "Early summer — ~every 7 days"
          : season === "late_summer"
            ? "Late summer — stretch when dry"
            : "Off-season — longer gaps OK"
    );
  }

  // Wet week → grass grows faster → shorten interval (min 4).
  // Still nudge custom intervals when it's soaked (growth doesn't care about settings).
  if (precip7 >= 1.5) {
    interval = Math.max(4, interval - 2);
    reasonParts.push(`Wet week (${precip7.toFixed(1)}" rain) — mow sooner`);
  } else if (precip7 >= 0.75) {
    interval = Math.max(5, interval - 1);
    reasonParts.push(`Some rain this week (${precip7.toFixed(1)}")`);
  } else if (
    !hasCustomInterval &&
    season === "late_summer" &&
    precip7 < 0.25
  ) {
    // Really dry late summer → stretch toward 12 (seasonal default only)
    interval = Math.min(12, Math.max(interval, 10));
    reasonParts.push("Dry stretch — can wait 10–12 days");
  }

  // Overnight / morning soak → don't mow muddy yards today
  if (precip1 >= 0.5 || precipTodayNightOrMorning >= 0.4) {
    rainDelayDays = 1;
    reasonParts.push(
      `Recent rain (~${Math.max(precip1, precipTodayNightOrMorning).toFixed(1)}") — wait ~24h for mud`
    );
  }

  // Severe weather flag on today
  if (weather[0]?.severeFlag) {
    rainDelayDays = Math.max(rainDelayDays, 1);
    reasonParts.push("Severe weather risk — skip outdoor work");
  }

  const last = lastMowedAt ? new Date(lastMowedAt) : null;
  const daysSinceMow = last
    ? Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Adhoc with no history → due "now" (one-time job waiting)
  let nextDue: Date;
  if (!last) {
    nextDue = new Date(now);
    reasonParts.push(
      lawn.scheduleType === "adhoc"
        ? "One-time job — not yet completed"
        : "No mow history yet — treat as due"
    );
  } else {
    nextDue = new Date(last);
    nextDue.setDate(nextDue.getDate() + interval + rainDelayDays);
  }

  // If rain delay and due is today/past, push due to tomorrow
  if (rainDelayDays > 0 && nextDue <= now) {
    nextDue = new Date(now);
    nextDue.setDate(nextDue.getDate() + rainDelayDays);
  }

  const dueStatus = computeDueStatus(
    nextDue,
    now,
    daysSinceMow,
    interval,
    rainDelayDays
  );

  return {
    lawnId: lawn.id,
    lastMowedAt,
    daysSinceMow,
    recommendedIntervalDays: interval,
    nextDueDate: nextDue.toISOString().slice(0, 10),
    dueStatus,
    reason: reasonParts.join(". ") + ".",
    rainDelayDays,
  };
}

function computeDueStatus(
  nextDue: Date,
  now: Date,
  daysSince: number | null,
  interval: number,
  rainDelay: number
): DueStatus {
  if (rainDelay > 0) {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const dueDay = new Date(nextDue);
    dueDay.setHours(0, 0, 0, 0);
    if (dueDay.getTime() > startOfToday.getTime()) return "skip_rain";
  }

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dueDay = new Date(nextDue);
  dueDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (dueDay.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "due";
  if (diffDays === 1) return "due_soon";

  // Also flag if we're past ~85% of the interval without a due date calc edge case
  if (daysSince != null && daysSince >= interval) return "due";

  return "ok";
}

/** Rough job duration by yard size (minutes). */
export function estimateMinutes(size: Lawn["size"]): number {
  switch (size) {
    case "small":
      return 35;
    case "medium":
      return 50;
    case "large":
      return 75;
    case "xlarge":
      return 100;
  }
}

export function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
