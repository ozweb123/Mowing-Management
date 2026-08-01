"use client";

export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss?: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-3 flex items-start justify-between gap-3 rounded-xl border-2 border-jd-danger/40 bg-red-50 px-3 py-3 text-sm font-medium text-jd-danger"
    >
      <span>{message}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-[32px] min-w-[32px] font-bold"
          aria-label="Dismiss"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
