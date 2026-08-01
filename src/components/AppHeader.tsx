"use client";

/**
 * Brand-forward header — "Miles Mowing" must read as the hero signal,
 * not a tiny nav eyebrow (per design rules).
 */
export function AppHeader({
  subtitle,
  compact = false,
}: {
  subtitle?: string;
  compact?: boolean;
}) {
  return (
    <header className={`safe-top ${compact ? "mb-3" : "mb-5"}`}>
      <div className="jd-stripe mb-3 h-1.5 rounded-full" aria-hidden />
      <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-jd-green-dark/80">
        Southwest Topeka · John Deere spirit
      </p>
      <h1
        className={`font-display font-black leading-tight text-jd-green-deep ${
          compact ? "text-2xl" : "text-3xl sm:text-4xl"
        }`}
      >
        Miles{" "}
        <span className="text-jd-green">Mowing</span>{" "}
        <span className="text-jd-soil/80">Management</span>
      </h1>
      {subtitle ? (
        <p className="mt-1 text-sm font-medium text-jd-soil/80">{subtitle}</p>
      ) : null}
    </header>
  );
}
