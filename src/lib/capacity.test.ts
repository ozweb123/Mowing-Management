import { describe, expect, it } from "vitest";
import { availableMinutesForDate, type CapacitySettings } from "./capacity";

describe("availableMinutesForDate", () => {
  const settings: CapacitySettings = {
    availableStartHour: 8,
    availableEndHour: 18,
    blocked: [
      { dow: 2, startHour: 15, endHour: 19, label: "Practice" }, // Tue
    ],
  };

  it("returns full window with no blocks", () => {
    // Sunday
    const sun = new Date("2026-08-02T12:00:00");
    expect(sun.getDay()).toBe(0);
    const r = availableMinutesForDate(sun, settings);
    expect(r.windowMinutes).toBe(600);
    expect(r.availableMinutes).toBe(600);
    expect(r.blockedMinutes).toBe(0);
  });

  it("subtracts overlapping practice block on Tuesday", () => {
    const tue = new Date("2026-08-04T12:00:00");
    expect(tue.getDay()).toBe(2);
    const r = availableMinutesForDate(tue, settings);
    // 8–18 = 10h; block 15–19 overlaps 15–18 = 3h → 7h free
    expect(r.blockedMinutes).toBe(180);
    expect(r.availableMinutes).toBe(420);
    expect(r.blockedLabels[0]).toContain("Practice");
  });
});
