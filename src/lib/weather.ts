/**
 * Weather via Open-Meteo (no API key) for Southwest Topeka, KS.
 * Builds a hybrid daily/hourly view with 3 periods:
 *   Night     8pm–8am
 *   Morning   8am–1pm
 *   Afternoon 1pm–8pm
 *
 * Sun + wind tracked for morning/afternoon only (per product request).
 */

import type { WeatherDay, WeatherPeriod } from "./types";

const FORECAST_DAYS = 10;

type OpenMeteoHourly = {
  time: string[];
  temperature_2m: (number | null)[];
  precipitation_probability: (number | null)[];
  precipitation: (number | null)[];
  windspeed_10m: (number | null)[];
  windgusts_10m: (number | null)[];
  sunshine_duration?: (number | null)[];
  weathercode?: (number | null)[];
};

type OpenMeteoDaily = {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_sum: (number | null)[];
  weathercode?: (number | null)[];
};

type OpenMeteoResponse = {
  hourly: OpenMeteoHourly;
  daily: OpenMeteoDaily;
};

/** WMO weather codes → short kid-friendly summary. */
function codeToSummary(code: number | null | undefined): string {
  if (code == null) return "—";
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow/ice";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  if (code <= 99) return "Thunderstorms";
  return "Weather";
}

function isSevere(code: number | null | undefined): boolean {
  return code != null && code >= 95;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function max(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.max(...nums);
}

function sum(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0);
}

/**
 * Slice hourly arrays into a named period for one calendar date.
 * Night spans previous evening 20:00 through morning 08:00.
 */
function buildPeriod(
  label: WeatherPeriod["label"],
  dateStr: string,
  hourly: OpenMeteoHourly,
  includeSunWind: boolean
): WeatherPeriod {
  const times = hourly.time;
  const indices: number[] = [];

  for (let i = 0; i < times.length; i++) {
    const t = times[i]; // "2026-08-01T14:00"
    const [d, hm] = t.split("T");
    const hour = parseInt(hm.slice(0, 2), 10);

    if (label === "morning" && d === dateStr && hour >= 8 && hour < 13) {
      indices.push(i);
    } else if (
      label === "afternoon" &&
      d === dateStr &&
      hour >= 13 &&
      hour < 20
    ) {
      indices.push(i);
    } else if (label === "night") {
      // Night for date D = D-1 20:00–23:00 + D 00:00–07:00
      const prev = previousDate(dateStr);
      if (
        (d === prev && hour >= 20) ||
        (d === dateStr && hour < 8)
      ) {
        indices.push(i);
      }
    }
  }

  const pick = <T,>(arr: (T | null)[] | undefined): T[] =>
    indices
      .map((i) => (arr ? arr[i] : null))
      .filter((v): v is T => v != null);

  const precipProb = avg(pick(hourly.precipitation_probability));
  // Open-Meteo precip is mm; convert to inches
  const precipMm = sum(pick(hourly.precipitation)) ?? 0;
  const precipIn = precipMm / 25.4;

  let sunshineMinutes: number | null = null;
  let windMph: number | null = null;
  let windGustMph: number | null = null;

  if (includeSunWind) {
    const sunSec = sum(pick(hourly.sunshine_duration ?? []));
    sunshineMinutes = sunSec != null ? Math.round(sunSec / 60) : null;
    // windspeed already requested in mph via windspeed_unit=mph
    windMph = avg(pick(hourly.windspeed_10m));
    windGustMph = max(pick(hourly.windgusts_10m));
  }

  const tempF = avg(pick(hourly.temperature_2m));

  return {
    label,
    startHour: label === "night" ? 20 : label === "morning" ? 8 : 13,
    endHour: label === "night" ? 8 : label === "morning" ? 13 : 20,
    precipProbability: precipProb != null ? Math.round(precipProb) : null,
    precipInches: Math.round(precipIn * 100) / 100,
    sunshineMinutes,
    windMph: windMph != null ? Math.round(windMph) : null,
    windGustMph: windGustMph != null ? Math.round(windGustMph) : null,
    tempF: tempF != null ? Math.round(tempF) : null,
  };
}

function previousDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Fetch and normalize a 10-day period forecast. Cached briefly in-memory. */
let cache: { at: number; data: WeatherDay[] } | null = null;
const CACHE_MS = 15 * 60 * 1000;

export async function fetchWeatherForecast(
  force = false
): Promise<WeatherDay[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.data;
  }

  const lat = process.env.WEATHER_LAT || "39.0375";
  const lon = process.env.WEATHER_LON || "-95.7250";
  const tz = process.env.WEATHER_TIMEZONE || "America/Chicago";

  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    timezone: tz,
    forecast_days: String(FORECAST_DAYS),
    temperature_unit: "fahrenheit",
    windspeed_unit: "mph",
    precipitation_unit: "mm",
    hourly: [
      "temperature_2m",
      "precipitation_probability",
      "precipitation",
      "windspeed_10m",
      "windgusts_10m",
      "sunshine_duration",
      "weathercode",
    ].join(","),
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "weathercode",
    ].join(","),
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      next: { revalidate: 900 },
      headers: { Accept: "application/json" },
    });
  } catch (e) {
    console.error("[weather] network error", e);
    return cache?.data ?? fallbackWeather();
  }

  if (!res.ok) {
    console.error("[weather] bad status", res.status);
    return cache?.data ?? fallbackWeather();
  }

  const json = (await res.json()) as OpenMeteoResponse;
  const days: WeatherDay[] = json.daily.time.map((dateStr, idx) => {
    const code = json.daily.weathercode?.[idx] ?? null;
    const periods: WeatherPeriod[] = [
      buildPeriod("night", dateStr, json.hourly, false),
      buildPeriod("morning", dateStr, json.hourly, true),
      buildPeriod("afternoon", dateStr, json.hourly, true),
    ];

    return {
      date: dateStr,
      summary: codeToSummary(code),
      highF: Math.round(json.daily.temperature_2m_max[idx] ?? 0),
      lowF: Math.round(json.daily.temperature_2m_min[idx] ?? 0),
      periods,
      severeFlag: isSevere(code),
    };
  });

  cache = { at: Date.now(), data: days };
  return days;
}

/** Offline / API-down stub so the app still works. */
function fallbackWeather(): WeatherDay[] {
  const days: WeatherDay[] = [];
  const now = new Date();
  for (let i = 0; i < FORECAST_DAYS; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    days.push({
      date,
      summary: "Forecast unavailable",
      highF: 85,
      lowF: 65,
      severeFlag: false,
      periods: [
        {
          label: "night",
          startHour: 20,
          endHour: 8,
          precipProbability: null,
          precipInches: null,
          sunshineMinutes: null,
          windMph: null,
          windGustMph: null,
          tempF: 68,
        },
        {
          label: "morning",
          startHour: 8,
          endHour: 13,
          precipProbability: null,
          precipInches: null,
          sunshineMinutes: null,
          windMph: null,
          windGustMph: null,
          tempF: 78,
        },
        {
          label: "afternoon",
          startHour: 13,
          endHour: 20,
          precipProbability: null,
          precipInches: null,
          sunshineMinutes: null,
          windMph: null,
          windGustMph: null,
          tempF: 88,
        },
      ],
    });
  }
  return days;
}

/** Clear weather cache (tests). */
export function _clearWeatherCache() {
  cache = null;
}
