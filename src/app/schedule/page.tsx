"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { StatusBadge } from "@/components/StatusBadge";
import { api, ClientApiError } from "@/lib/client-api";
import { dollars } from "@/lib/forecast";
import type { Lawn, LawnForecast } from "@/lib/types";

export default function SchedulePage() {
  const [season, setSeason] = useState("");
  const [rows, setRows] = useState<
    Array<{ lawn: Lawn; forecast: LawnForecast }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<{
          season: string;
          forecasts: Array<{ lawn: Lawn; forecast: LawnForecast }>;
        }>("/api/forecast");
        setSeason(data.season);
        setRows(
          [...data.forecasts].sort((a, b) =>
            a.forecast.nextDueDate.localeCompare(b.forecast.nextDueDate)
          )
        );
      } catch (e) {
        setError(
          e instanceof ClientApiError ? e.message : "Schedule unavailable."
        );
      }
    })();
  }, []);

  return (
    <main>
      <AppHeader
        compact
        subtitle={`Full forecast · ${season.replace("_", " ") || "…"} intervals for Topeka.`}
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <ul className="space-y-2">
        {rows.map(({ lawn, forecast }) => (
          <li key={lawn.id} className="panel">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-lg font-bold text-jd-green-deep">
                  {lawn.name}
                </p>
                <p className="text-sm text-jd-soil/75">
                  {dollars(lawn.chargeCents)} · every ~
                  {forecast.recommendedIntervalDays} days · {lawn.scheduleType}
                </p>
              </div>
              <StatusBadge status={forecast.dueStatus} />
            </div>
            <p className="mt-1 text-sm">
              Last:{" "}
              {forecast.lastMowedAt
                ? new Date(forecast.lastMowedAt).toLocaleDateString()
                : "—"}
              {" · "}
              Next: <strong>{forecast.nextDueDate}</strong>
            </p>
            <p className="mt-1 text-xs text-jd-soil/60">{forecast.reason}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
