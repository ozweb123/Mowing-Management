"use client";

import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { WeatherStrip } from "@/components/WeatherStrip";
import { JobCard } from "@/components/JobCard";
import { ErrorBanner } from "@/components/ErrorBanner";
import { api, ClientApiError } from "@/lib/client-api";
import { dollars } from "@/lib/forecast";
import type { TodayJob, WeatherDay } from "@/lib/types";

type TodayPayload = {
  ownerName: string;
  season: string;
  weatherToday?: WeatherDay;
  jobs: TodayJob[];
  summary: {
    yardCount: number;
    estimatedCents: number;
    estimatedMinutes: number;
    gasEstimateCents: number;
  };
  rainPushUntil: string | null;
};

export default function TodayPage() {
  const [data, setData] = useState<TodayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const view = await api<TodayPayload>("/api/today");
      setData(view);
    } catch (e) {
      setError(
        e instanceof ClientApiError ? e.message : "Could not load Today."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function rainPush() {
    setPushing(true);
    setError(null);
    try {
      await api("/api/rain-push", {
        method: "POST",
        body: JSON.stringify({ days: 1 }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rain push failed.");
    } finally {
      setPushing(false);
    }
  }

  async function clearPush() {
    await api("/api/rain-push", { method: "DELETE" });
    await load();
  }

  const greetingHour = new Date().getHours();
  const greeting =
    greetingHour < 12 ? "Good morning" : greetingHour < 17 ? "Hey" : "Evening";

  return (
    <main>
      <AppHeader
        subtitle={`${greeting}, ${data?.ownerName ?? "Miles"} — let's earn.`}
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <WeatherStrip day={data?.weatherToday} />

      <section className="panel mt-3 animate-rise-delay-1 border-l-4 border-l-jd-green">
        <p className="font-display text-2xl font-bold text-jd-green-deep">
          {data?.summary.yardCount ?? "—"} yards ·{" "}
          {data ? dollars(data.summary.estimatedCents) : "$—"} est.
        </p>
        <p className="text-sm text-jd-soil/75">
          ~{data ? Math.round((data.summary.estimatedMinutes || 0) / 60 * 10) / 10 : "—"} hrs
          {" · "}
          Gas ~{data ? dollars(data.summary.gasEstimateCents) : "$—"}
          {" · "}
          Season:{" "}
          <span className="font-semibold capitalize">
            {data?.season?.replace("_", " ") ?? "—"}
          </span>
        </p>
      </section>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn-secondary flex-1 text-sm"
          disabled={pushing || loading}
          onClick={() => void rainPush()}
        >
          {pushing ? "Pushing…" : "Rain day — push all 1 day"}
        </button>
        {data?.rainPushUntil ? (
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => void clearPush()}
          >
            Clear push
          </button>
        ) : null}
      </div>

      <h2 className="mb-2 mt-6 font-display text-xl font-bold text-jd-green-deep">
        Today&apos;s route
      </h2>

      {loading ? (
        <p className="panel text-sm">Loading your yards…</p>
      ) : data?.jobs.length ? (
        <div className="space-y-3">
          {data.jobs.map((job) => (
            <JobCard key={job.lawn.id} job={job} onDone={() => void load()} />
          ))}
        </div>
      ) : (
        <p className="panel text-sm">
          No active lawns yet — add one under Lawns.
        </p>
      )}
    </main>
  );
}
