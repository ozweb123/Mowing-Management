import type { WeatherDay } from "@/lib/types";

/** Compact today weather strip for the morning dashboard. */
export function WeatherStrip({ day }: { day?: WeatherDay }) {
  if (!day) {
    return (
      <div className="panel animate-rise text-sm">Weather loading…</div>
    );
  }

  const morning = day.periods.find((p) => p.label === "morning");
  const afternoon = day.periods.find((p) => p.label === "afternoon");
  const stormChance = Math.max(
    morning?.precipProbability ?? 0,
    afternoon?.precipProbability ?? 0
  );

  return (
    <div className="panel animate-rise border-l-4 border-l-jd-yellow">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-lg font-bold text-jd-green-deep">
          Today: {day.highF}° / {day.lowF}°
        </p>
        <p className="text-sm font-semibold text-jd-soil/80">{day.summary}</p>
      </div>
      <p className="mt-1 text-sm">
        Afternoon storms{" "}
        <strong className={stormChance >= 50 ? "text-jd-danger" : ""}>
          {stormChance}%
        </strong>
        {afternoon?.precipInches != null
          ? ` · ~${afternoon.precipInches}" possible`
          : null}
        {afternoon?.windMph != null ? ` · Wind ${afternoon.windMph} mph` : null}
      </p>
      {day.severeFlag ? (
        <p className="mt-2 rounded-lg bg-jd-danger/15 px-2 py-1 text-sm font-bold text-jd-danger">
          Severe weather risk — consider holding the mower.
        </p>
      ) : null}
    </div>
  );
}
