"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { StatusBadge } from "@/components/StatusBadge";
import { api, ClientApiError } from "@/lib/client-api";
import { dollars } from "@/lib/forecast";
import type { Lawn, LawnForecast, WeatherDay } from "@/lib/types";

type WeekJob = {
  lawn: Lawn;
  forecast: LawnForecast;
  estimatedMinutes: number;
  plannedDate: string;
  fit: "good" | "ok" | "risky";
  fitNote: string;
};

type WeekDay = {
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
  tip: string | null;
};

type WeekPayload = {
  season: string;
  days: WeekDay[];
  suggestions: Array<{
    lawnId: string;
    lawnName: string;
    fromDate: string;
    toDate: string;
    note: string;
  }>;
};

const fitClass = {
  good: "text-jd-ok",
  ok: "text-jd-warn",
  risky: "text-jd-danger",
} as const;

/**
 * Mobile week planner — stack of days (not a desktop calendar grid).
 * Accept dry-window suggestions or pin a yard to a day.
 */
export default function WeekPage() {
  const [data, setData] = useState<WeekPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<WeekPayload>("/api/week"));
    } catch (e) {
      setError(
        e instanceof ClientApiError ? e.message : "Could not load week plan."
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function pin(lawnId: string, date: string | null) {
    setBusyId(lawnId);
    setError(null);
    try {
      await api("/api/week/plan", {
        method: "POST",
        body: JSON.stringify({ lawnId, date }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update plan.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main>
      <AppHeader
        compact
        subtitle="Fit yards into dry windows — before the week gets weird."
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="mb-3 flex gap-2">
        <Link href="/weather" className="btn-secondary flex-1 text-center text-sm">
          Full weather
        </Link>
        <Link href="/more" className="btn-secondary flex-1 text-center text-sm">
          Edit free time
        </Link>
      </div>

      {data?.suggestions.length ? (
        <section className="panel mb-4 border-l-4 border-l-jd-yellow">
          <h2 className="font-display text-lg font-bold text-jd-green-deep">
            Dry-window moves
          </h2>
          <ul className="mt-2 space-y-2">
            {data.suggestions.map((s) => (
              <li
                key={`${s.lawnId}-${s.toDate}`}
                className="rounded-xl bg-jd-green/5 px-3 py-2 text-sm"
              >
                <p className="font-bold">{s.lawnName}</p>
                <p className="text-jd-soil/75">{s.note}</p>
                <button
                  type="button"
                  className="btn-primary mt-2 w-full py-2 text-sm"
                  disabled={busyId === s.lawnId}
                  onClick={() => void pin(s.lawnId, s.toDate)}
                >
                  {busyId === s.lawnId ? "Saving…" : `Pin to ${s.toDate.slice(5)}`}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ul className="space-y-3">
        {(data?.days ?? []).map((day) => {
          const availHrs = Math.round((day.availableMinutes / 60) * 10) / 10;
          const schedHrs = Math.round((day.scheduledMinutes / 60) * 10) / 10;
          return (
            <li
              key={day.date}
              className={`panel animate-rise ${
                day.isToday ? "ring-2 ring-jd-yellow" : ""
              } ${day.overbooked ? "border-l-4 border-l-jd-danger" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-xl font-bold text-jd-green-deep">
                    {day.isToday ? "Today" : day.weekday}{" "}
                    <span className="text-base text-jd-soil/60">
                      {day.date.slice(5)}
                    </span>
                  </p>
                  <p className="text-sm text-jd-soil/75">
                    {day.weather?.summary ?? "—"} · {day.weather?.highF ?? "—"}°
                    {" · "}
                    Rain {day.rainRisk}%
                  </p>
                </div>
                <p
                  className={`text-right text-sm font-bold ${
                    day.overbooked ? "text-jd-danger" : "text-jd-green-dark"
                  }`}
                >
                  {schedHrs}/{availHrs}h
                </p>
              </div>

              {day.blockedLabels.length ? (
                <p className="mt-1 text-xs text-jd-soil/60">
                  Blocked: {day.blockedLabels.join(" · ")}
                </p>
              ) : null}

              {day.tip ? (
                <p className="mt-2 rounded-lg bg-jd-green/10 px-2 py-1 text-xs font-semibold text-jd-green-dark">
                  {day.tip}
                </p>
              ) : null}

              <ul className="mt-3 space-y-2">
                {day.jobs.map((job) => (
                  <li
                    key={job.lawn.id}
                    className="rounded-xl border border-jd-green/10 bg-white/60 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-jd-green-deep">
                          {job.lawn.name}{" "}
                          <span className="font-semibold text-jd-soil/60">
                            {dollars(job.lawn.chargeCents)} · {job.estimatedMinutes}m
                          </span>
                        </p>
                        <p className={`text-xs font-semibold ${fitClass[job.fit]}`}>
                          {job.fitNote}
                        </p>
                      </div>
                      <StatusBadge status={job.forecast.dueStatus} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!day.isToday ? (
                        <button
                          type="button"
                          className="btn-secondary px-3 py-2 text-xs"
                          disabled={busyId === job.lawn.id}
                          onClick={() => void pin(job.lawn.id, day.date)}
                        >
                          Pin here
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-secondary px-3 py-2 text-xs"
                        disabled={busyId === job.lawn.id}
                        onClick={() => void pin(job.lawn.id, null)}
                      >
                        Clear pin
                      </button>
                      {day.isToday ? (
                        <Link
                          href="/"
                          className="btn-primary px-3 py-2 text-xs"
                        >
                          Open Today
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
                {!day.jobs.length ? (
                  <li className="text-sm text-jd-soil/55">No yards planned.</li>
                ) : null}
              </ul>
            </li>
          );
        })}
      </ul>

      {!data ? (
        <p className="panel mt-3 text-sm">Building your week…</p>
      ) : null}
    </main>
  );
}
