/**
 * Build an Apple Calendar–friendly ICS feed from the week mowing plan.
 */

import { getCapacitySettings } from "@/lib/capacity";
import { mowerLabel } from "@/lib/mowers";
import { buildWeekView } from "@/lib/week";

function escapeText(text: string): string {
  return (text || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatLocal(dt: Date): string {
  return (
    `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}` +
    `T${pad(dt.getHours())}${pad(dt.getMinutes())}${pad(dt.getSeconds())}`
  );
}

export function eventUid(lawnId: string, dateStr: string): string {
  return `mmm-${lawnId}-${dateStr}@milesmowing.local`;
}

export async function buildIcs(calendarName = "Miles Mowing"): Promise<string> {
  const view = await buildWeekView(7);
  const capacity = getCapacitySettings();
  const startHour = capacity.availableStartHour;
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Miles Mowing Management//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "X-WR-TIMEZONE:America/Chicago",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];

  for (const day of view.days) {
    let cursorHour = startHour;
    for (const job of day.jobs) {
      const start = new Date(`${day.date}T12:00:00`);
      start.setHours(cursorHour, 0, 0, 0);
      const end = new Date(
        start.getTime() + Math.max(30, job.estimatedMinutes) * 60_000
      );
      cursorHour = end.getHours() + (end.getMinutes() > 0 ? 1 : 0);
      if (cursorHour >= 22) cursorHour = startHour;

      const summary = `Mow ${job.lawn.name} — ${mowerLabel(job.lawn.mower)}`;
      const location =
        `${job.lawn.address || ""}, ${job.lawn.city || "Topeka, KS"}`.replace(
          /^,\s*/,
          ""
        );
      const description = [
        job.fitNote,
        job.lawn.notes,
        `Charge: $${(job.lawn.chargeCents / 100).toFixed(2)}`,
        `Mower: ${mowerLabel(job.lawn.mower)}`,
        `Dog: ${job.lawn.dogWarning}`,
      ]
        .filter(Boolean)
        .join("\n");

      lines.push(
        "BEGIN:VEVENT",
        `UID:${eventUid(job.lawn.id, day.date)}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=America/Chicago:${formatLocal(start)}`,
        `DTEND;TZID=America/Chicago:${formatLocal(end)}`,
        `SUMMARY:${escapeText(summary)}`,
        `LOCATION:${escapeText(location)}`,
        `DESCRIPTION:${escapeText(description)}`,
        "STATUS:CONFIRMED",
        "TRANSP:OPAQUE",
        "END:VEVENT"
      );
    }
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
