/**
 * School/sports capacity meter — scheduled mow minutes vs free window today.
 */
export function CapacityBar({
  scheduledMinutes,
  availableMinutes,
  overbooked,
  fillPercent,
  workWindowLabel,
  blockedLabels,
}: {
  scheduledMinutes: number;
  availableMinutes: number;
  overbooked: boolean;
  fillPercent: number;
  workWindowLabel: string;
  blockedLabels: string[];
}) {
  const schedHrs = Math.round((scheduledMinutes / 60) * 10) / 10;
  const availHrs = Math.round((availableMinutes / 60) * 10) / 10;

  return (
    <section
      className={`panel mt-3 animate-rise-delay-1 ${
        overbooked ? "border-l-4 border-l-jd-danger" : "border-l-4 border-l-jd-yellow"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-lg font-bold text-jd-green-deep">
          {schedHrs} hrs scheduled
          <span className="text-base font-semibold text-jd-soil/60">
            {" "}
            / {availHrs} hrs free
          </span>
        </p>
        <p className="text-xs font-bold uppercase tracking-wide text-jd-green-dark">
          {workWindowLabel}
        </p>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-jd-green/15">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            overbooked ? "bg-jd-danger" : fillPercent >= 85 ? "bg-jd-warn" : "bg-jd-green"
          }`}
          style={{ width: `${Math.min(100, fillPercent)}%` }}
        />
      </div>
      {overbooked ? (
        <p className="mt-2 text-sm font-bold text-jd-danger">
          Overbooked — move a yard in Week, or you&apos;ll be late for practice.
        </p>
      ) : blockedLabels.length ? (
        <p className="mt-2 text-xs text-jd-soil/70">
          Blocked: {blockedLabels.join(" · ")}
        </p>
      ) : (
        <p className="mt-2 text-xs text-jd-soil/70">
          No school/sports blocks today — full window open.
        </p>
      )}
    </section>
  );
}
