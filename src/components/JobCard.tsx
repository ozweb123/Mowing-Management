"use client";

import { useState } from "react";
import { StatusBadge } from "./StatusBadge";
import { api, mapsUrl, smsUrl } from "@/lib/client-api";
import { dollars } from "@/lib/forecast";
import type { TodayJob } from "@/lib/types";

const dogLabel: Record<string, string> = {
  none: "",
  friendly: "Friendly dog",
  caution: "Dog — knock first",
  do_not_enter: "DO NOT ENTER — dog",
};

export function JobCard({
  job,
  onDone,
}: {
  job: TodayJob;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { lawn, forecast } = job;

  async function markDone(paid: boolean) {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/mowings", {
        method: "POST",
        body: JSON.stringify({
          lawnId: lawn.id,
          paymentStatus: paid ? "paid" : "owes",
          notes: "",
        }),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not mark done.");
    } finally {
      setBusy(false);
    }
  }

  const nav = mapsUrl(lawn.address, lawn.city);
  const textMsg = smsUrl(
    `Hey! This is Miles — on my way to mow ${lawn.address || "your yard"} shortly.`
  );

  return (
    <article className="panel animate-rise-delay-1 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-xl font-bold text-jd-green-deep">
            {lawn.name}
          </h3>
          <p className="text-sm text-jd-soil/75">
            {lawn.address || "No address"} · {dollars(lawn.chargeCents)} ·{" "}
            {job.estimatedMinutes} min
          </p>
        </div>
        <StatusBadge status={forecast.dueStatus} />
      </div>

      {lawn.dogWarning !== "none" ? (
        <p
          className={`rounded-lg px-2 py-1 text-sm font-bold ${
            lawn.dogWarning === "do_not_enter"
              ? "bg-jd-danger/15 text-jd-danger"
              : "bg-jd-warn/15 text-jd-warn"
          }`}
        >
          {dogLabel[lawn.dogWarning]}
        </p>
      ) : null}

      {lawn.notes ? (
        <p className="text-sm leading-snug text-jd-soil/90">{lawn.notes}</p>
      ) : null}

      {lawn.gateCode ? (
        <p className="text-sm font-semibold">
          Gate: <span className="font-mono">{lawn.gateCode}</span>
        </p>
      ) : null}

      <p className="text-xs text-jd-soil/65">{forecast.reason}</p>

      {err ? <p className="text-sm font-semibold text-jd-danger">{err}</p> : null}

      <div className="flex gap-2">
        <a href={nav} className="btn-secondary flex-1 text-center text-sm">
          Navigate
        </a>
        <a href={textMsg} className="btn-secondary flex-1 text-center text-sm">
          On my way
        </a>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="btn-done"
          disabled={busy}
          onClick={() => markDone(false)}
        >
          {busy ? "Saving…" : "Done"}
        </button>
        <button
          type="button"
          className="btn-primary min-h-[56px] flex-[0.7] text-sm"
          disabled={busy}
          onClick={() => markDone(true)}
        >
          Done + Paid
        </button>
      </div>
    </article>
  );
}
