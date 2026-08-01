"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { api, ClientApiError } from "@/lib/client-api";
import { dollars } from "@/lib/forecast";
import type { Lawn, MowingRecord } from "@/lib/types";

export default function HistoryPage() {
  const [rows, setRows] = useState<
    Array<MowingRecord & { lawnName: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [mowings, lawns] = await Promise.all([
          api<MowingRecord[]>("/api/mowings?limit=100"),
          api<Lawn[]>("/api/lawns?all=1"),
        ]);
        const map = new Map(lawns.map((l) => [l.id, l.name]));
        setRows(
          mowings.map((m) => ({
            ...m,
            lawnName: map.get(m.lawnId) || "Unknown yard",
          }))
        );
      } catch (e) {
        setError(
          e instanceof ClientApiError ? e.message : "History unavailable."
        );
      }
    })();
  }, []);

  return (
    <main>
      <AppHeader compact subtitle="Every completed mow — proof when neighbors ask." />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <ul className="space-y-2">
        {rows.map((m) => (
          <li key={m.id} className="panel text-sm">
            <div className="flex justify-between gap-2">
              <p className="font-bold text-jd-green-deep">{m.lawnName}</p>
              <p className="font-semibold">{dollars(m.amountCents)}</p>
            </div>
            <p className="text-jd-soil/70">
              {new Date(m.mowedAt).toLocaleString()} ·{" "}
              <span
                className={
                  m.paymentStatus === "owes"
                    ? "font-bold text-jd-danger"
                    : "text-jd-ok"
                }
              >
                {m.paymentStatus}
              </span>
            </p>
          </li>
        ))}
        {!rows.length ? (
          <li className="panel text-sm">No history yet — hit Done on Today.</li>
        ) : null}
      </ul>
    </main>
  );
}
