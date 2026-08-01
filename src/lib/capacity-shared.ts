/**
 * Client-safe capacity helpers (no Node/SQLite imports).
 */

export type BlockedSlot = {
  /** 0 = Sunday … 6 = Saturday (JS Date.getDay()). */
  dow: number;
  startHour: number;
  endHour: number;
  label: string;
};

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function fmtHour(h: number): string {
  const ampm = h >= 12 ? "pm" : "am";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${ampm}`;
}

export function dowName(dow: number): string {
  return DOW_NAMES[dow] ?? "?";
}
