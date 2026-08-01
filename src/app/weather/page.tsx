"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { api, ClientApiError } from "@/lib/client-api";
import type { WeatherDay } from "@/lib/types";

const periodTitle = {
  night: "Night 8pm–8am",
  morning: "Morning 8am–1pm",
  afternoon: "Afternoon 1pm–8pm",
} as const;

export default function WeatherPage() {
  const [days, setDays] = useState<WeatherDay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<{ days: WeatherDay[] }>("/api/weather");
        setDays(data.days);
        if (data.days[0]) setOpen(data.days[0].date);
      } catch (e) {
        setError(
          e instanceof ClientApiError ? e.message : "Weather unavailable."
        );
      }
    })();
  }, []);

  return (
    <main>
      <AppHeader
        compact
        subtitle="10-day SW Topeka forecast — rain by period, sun & wind AM/PM."
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <ul className="space-y-2">
        {days.map((day, idx) => {
          const expanded = open === day.date;
          const afternoon = day.periods.find((p) => p.label === "afternoon");
          return (
            <li key={day.date} className="panel animate-rise">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setOpen(expanded ? null : day.date)}
              >
                <div>
                  <p className="font-display text-lg font-bold text-jd-green-deep">
                    {idx === 0
                      ? "Today"
                      : idx === 1
                        ? "Tomorrow"
                        : new Date(day.date + "T12:00:00").toLocaleDateString(
                            undefined,
                            { weekday: "short", month: "short", day: "numeric" }
                          )}
                  </p>
                  <p className="text-sm text-jd-soil/75">
                    {day.summary} · {day.highF}° / {day.lowF}°
                    {afternoon?.precipProbability != null
                      ? ` · Rain ${afternoon.precipProbability}%`
                      : ""}
                  </p>
                </div>
                <span className="text-xl font-bold text-jd-green">
                  {expanded ? "−" : "+"}
                </span>
              </button>

              {expanded ? (
                <div className="mt-3 space-y-2 border-t border-jd-green/15 pt-3">
                  {day.periods.map((p) => (
                    <div
                      key={p.label}
                      className="rounded-xl bg-jd-green/5 px-3 py-2 text-sm"
                    >
                      <p className="font-bold text-jd-green-dark">
                        {periodTitle[p.label]}
                      </p>
                      <p>
                        Rain{" "}
                        {p.precipProbability != null
                          ? `${p.precipProbability}%`
                          : "—"}
                        {p.precipInches != null
                          ? ` · ${p.precipInches}"`
                          : ""}
                        {p.tempF != null ? ` · ${p.tempF}°` : ""}
                      </p>
                      {p.label !== "night" ? (
                        <p className="text-jd-soil/75">
                          Sun{" "}
                          {p.sunshineMinutes != null
                            ? `${p.sunshineMinutes} min`
                            : "—"}
                          {" · "}
                          Wind{" "}
                          {p.windMph != null ? `${p.windMph} mph` : "—"}
                          {p.windGustMph != null
                            ? ` (gusts ${p.windGustMph})`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  ))}
                  {day.severeFlag ? (
                    <p className="font-bold text-jd-danger">
                      Severe weather flagged for this day.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
