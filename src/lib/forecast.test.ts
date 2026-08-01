import { describe, expect, it } from "vitest";
import {
  baseIntervalForSeason,
  forecastLawn,
  getSeason,
} from "./forecast";
import type { Lawn, WeatherDay } from "./types";

function lawn(partial: Partial<Lawn> = {}): Lawn {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Test",
    address: "1 SW Test",
    city: "Topeka, KS",
    notes: "",
    chargeCents: 3500,
    size: "medium",
    scheduleType: "recurring",
    intervalDays: null,
    routeOrder: 10,
    dogWarning: "none",
    gateCode: "",
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

function dryWeather(days = 7): WeatherDay[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date("2026-08-01T12:00:00");
    d.setDate(d.getDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      summary: "Clear",
      highF: 92,
      lowF: 68,
      severeFlag: false,
      periods: [
        {
          label: "night",
          startHour: 20,
          endHour: 8,
          precipProbability: 5,
          precipInches: 0,
          sunshineMinutes: null,
          windMph: null,
          windGustMph: null,
          tempF: 70,
        },
        {
          label: "morning",
          startHour: 8,
          endHour: 13,
          precipProbability: 5,
          precipInches: 0,
          sunshineMinutes: 200,
          windMph: 8,
          windGustMph: 12,
          tempF: 82,
        },
        {
          label: "afternoon",
          startHour: 13,
          endHour: 20,
          precipProbability: 10,
          precipInches: 0,
          sunshineMinutes: 240,
          windMph: 12,
          windGustMph: 18,
          tempF: 92,
        },
      ],
    };
  });
}

describe("season intervals (Topeka)", () => {
  it("uses ~6 days in spring", () => {
    expect(getSeason(new Date("2026-04-15"))).toBe("spring");
    expect(baseIntervalForSeason("spring")).toBe(6);
  });

  it("uses ~7 days in early summer", () => {
    expect(getSeason(new Date("2026-06-20"))).toBe("early_summer");
    expect(baseIntervalForSeason("early_summer")).toBe(7);
  });

  it("stretches in late summer", () => {
    expect(getSeason(new Date("2026-08-01"))).toBe("late_summer");
    expect(baseIntervalForSeason("late_summer")).toBe(11);
  });
});

describe("forecastLawn", () => {
  it("marks overdue when past interval", () => {
    const last = new Date("2026-07-20T12:00:00").toISOString();
    const now = new Date("2026-08-01T12:00:00");
    const fc = forecastLawn(lawn(), last, dryWeather(), now);
    expect(fc.dueStatus).toBe("overdue");
    expect(fc.recommendedIntervalDays).toBeGreaterThanOrEqual(10);
  });

  it("delays after heavy rain", () => {
    const weather = dryWeather();
    weather[0].periods[0].precipInches = 0.6; // night soak
    const last = new Date("2026-07-25T12:00:00").toISOString();
    const now = new Date("2026-08-01T12:00:00");
    const fc = forecastLawn(lawn(), last, weather, now);
    expect(fc.rainDelayDays).toBeGreaterThanOrEqual(1);
    expect(fc.reason.toLowerCase()).toContain("rain");
  });

  it("respects custom intervalDays override", () => {
    const last = new Date("2026-07-28T12:00:00").toISOString();
    const now = new Date("2026-08-01T12:00:00");
    const fc = forecastLawn(
      lawn({ intervalDays: 5 }),
      last,
      dryWeather(),
      now
    );
    expect(fc.recommendedIntervalDays).toBe(5);
  });
});
