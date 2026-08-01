"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { StatusBadge } from "@/components/StatusBadge";
import { api, ClientApiError } from "@/lib/client-api";
import { dollars } from "@/lib/forecast";
import { MOWER_OPTIONS, type MowerCode } from "@/lib/mowers";
import type { Lawn, LawnForecast, MowingRecord } from "@/lib/types";

export default function LawnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lawn, setLawn] = useState<Lawn | null>(null);
  const [forecast, setForecast] = useState<LawnForecast | null>(null);
  const [history, setHistory] = useState<MowingRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [charge, setCharge] = useState("");
  const [notes, setNotes] = useState("");
  const [phone, setPhone] = useState("");
  const [mower, setMower] = useState<MowerCode>("john_deere_60_ztrak");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const l = await api<Lawn>(`/api/lawns/${id}`);
      setLawn(l);
      setCharge(String(l.chargeCents / 100));
      setNotes(l.notes);
      setPhone(l.phone || "");
      setMower(l.mower || "john_deere_60_ztrak");
      const mows = await api<MowingRecord[]>(
        `/api/mowings?lawnId=${id}&limit=20`
      );
      setHistory(mows);
      const fc = await api<{
        forecasts: Array<{ lawn: Lawn; forecast: LawnForecast }>;
      }>("/api/forecast");
      const mine = fc.forecasts.find((f) => f.lawn.id === id);
      setForecast(mine?.forecast ?? null);
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Load failed.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!lawn) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/lawns/${lawn.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          chargeDollars: Number(charge),
          notes,
          phone,
          mower,
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(mowId: string) {
    await api(`/api/mowings/${mowId}`, {
      method: "PATCH",
      body: JSON.stringify({ paymentStatus: "paid" }),
    });
    await load();
  }

  async function deleteForever() {
    if (!lawn) return;
    if (
      !confirm(
        `Permanently delete "${lawn.name}" and all its mow history? This cannot be undone.`
      )
    )
      return;
    try {
      await api(`/api/lawns/${lawn.id}?hard=1`, { method: "DELETE" });
      router.push("/lawns");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  if (!lawn) {
    return (
      <main>
        <AppHeader compact subtitle="Loading yard…" />
        <ErrorBanner message={error} />
      </main>
    );
  }

  return (
    <main>
      <button
        type="button"
        className="mb-2 text-sm font-bold text-jd-green-dark"
        onClick={() => router.push("/lawns")}
      >
        ← All lawns
      </button>
      <AppHeader compact subtitle={lawn.address || "Yard details"} />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="panel mb-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-bold text-jd-green-deep">
            {lawn.name}
          </h2>
          {forecast ? <StatusBadge status={forecast.dueStatus} /> : null}
        </div>
        <p className="mt-1 text-sm">
          Last mowed:{" "}
          {forecast?.lastMowedAt
            ? new Date(forecast.lastMowedAt).toLocaleDateString()
            : "Never"}
          {" · "}
          Next: {forecast?.nextDueDate ?? "—"}
        </p>
        <p className="mt-1 text-xs text-jd-soil/65">{forecast?.reason}</p>
      </div>

      <form onSubmit={save} className="panel mb-4 space-y-3">
        <div>
          <label className="label" htmlFor="charge">
            Charge ($)
          </label>
          <input
            id="charge"
            className="input"
            value={charge}
            onChange={(e) => setCharge(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Phone (On my way SMS)
          </label>
          <input
            id="phone"
            className="input"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="785-555-0100"
          />
        </div>
        <div>
          <label className="label" htmlFor="mower">
            Mower for this job
          </label>
          <select
            id="mower"
            className="input"
            value={mower}
            onChange={(e) => setMower(e.target.value as MowerCode)}
          >
            {(Object.keys(MOWER_OPTIONS) as MowerCode[]).map((code) => (
              <option key={code} value={code}>
                {MOWER_OPTIONS[code]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            className="input min-h-[100px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>

      <button
        type="button"
        className="btn-danger mb-4 w-full"
        onClick={() => void deleteForever()}
      >
        Delete forever
      </button>

      <h3 className="mb-2 font-display text-lg font-bold">Mow history</h3>
      <ul className="space-y-2">
        {history.map((m) => (
          <li key={m.id} className="panel flex items-center justify-between gap-2 text-sm">
            <div>
              <p className="font-semibold">
                {new Date(m.mowedAt).toLocaleDateString()} ·{" "}
                {dollars(m.amountCents)}
              </p>
              <p
                className={
                  m.paymentStatus === "owes"
                    ? "font-bold text-jd-danger"
                    : "text-jd-ok"
                }
              >
                {m.paymentStatus === "owes" ? "OWES" : m.paymentStatus}
              </p>
            </div>
            {m.paymentStatus !== "paid" ? (
              <button
                type="button"
                className="btn-primary px-3 py-2 text-sm"
                onClick={() => void markPaid(m.id)}
              >
                Mark paid
              </button>
            ) : null}
          </li>
        ))}
        {!history.length ? (
          <li className="panel text-sm">No mows recorded yet.</li>
        ) : null}
      </ul>
    </main>
  );
}
