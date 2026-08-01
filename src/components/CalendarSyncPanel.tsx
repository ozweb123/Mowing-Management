"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";

/**
 * iPhone Calendar subscribe helper — live ICS feed updates when schedule changes.
 */
export function CalendarSyncPanel() {
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const data = await api<{ token: string; subscribePath: string }>(
        "/api/calendar"
      );
      setPath(data.subscribePath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load calendar link.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const absolute =
    typeof window !== "undefined" && path
      ? `${window.location.origin}${path}`
      : path;

  async function copy() {
    if (!absolute) return;
    await navigator.clipboard.writeText(absolute);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function rotate() {
    if (!confirm("Rotate token? Old subscribe links will stop working.")) return;
    const data = await api<{ subscribePath: string }>("/api/calendar/rotate", {
      method: "POST",
    });
    setPath(data.subscribePath);
  }

  return (
    <section className="panel mb-4 border-l-4 border-l-jd-yellow">
      <h2 className="font-display text-lg font-bold text-jd-green-deep">
        iPhone Calendar sync
      </h2>
      <p className="mt-1 text-sm text-jd-soil/75">
        Subscribe once — Apple Calendar refreshes the feed when you change the
        week plan (usually every few hours).
      </p>
      {error ? <p className="mt-2 text-sm text-jd-danger">{error}</p> : null}
      {absolute ? (
        <p className="mt-2 break-all rounded-lg bg-jd-green/5 px-2 py-2 font-mono text-xs">
          {absolute}
        </p>
      ) : (
        <p className="mt-2 text-sm">Loading link…</p>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn-primary flex-1 text-sm" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy link"}
        </button>
        <a
          className="btn-secondary flex-1 text-center text-sm"
          href={path || "#"}
        >
          Download .ics
        </a>
      </div>
      <button
        type="button"
        className="mt-2 text-sm font-bold text-jd-danger"
        onClick={() => void rotate()}
      >
        Rotate link
      </button>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-jd-soil/70">
        <li>On iPhone: Settings → Apps → Calendar → Accounts → Add Account</li>
        <li>Other → Add Subscribed Calendar</li>
        <li>Paste the link above → Next → Save</li>
        <li>Open Calendar → calendars list → enable <strong>Miles Mowing</strong></li>
      </ol>
    </section>
  );
}
