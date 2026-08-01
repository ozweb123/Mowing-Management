import type { DueStatus } from "@/lib/types";

const styles: Record<DueStatus, string> = {
  overdue: "bg-jd-danger text-white due-pulse",
  due: "bg-jd-warn text-white",
  due_soon: "bg-jd-yellow text-jd-green-deep",
  skip_rain: "bg-sky-700 text-white",
  ok: "bg-jd-ok/20 text-jd-ok",
};

const labels: Record<DueStatus, string> = {
  overdue: "Overdue",
  due: "Due today",
  due_soon: "Due tomorrow",
  skip_rain: "Rain skip",
  ok: "On track",
};

export function StatusBadge({ status }: { status: DueStatus }) {
  return (
    <span
      className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
