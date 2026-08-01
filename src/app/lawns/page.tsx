"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { api, ClientApiError } from "@/lib/client-api";
import { dollars } from "@/lib/forecast";
import type { Lawn } from "@/lib/types";

const emptyForm = {
  name: "",
  address: "",
  notes: "",
  chargeDollars: "35",
  size: "medium",
  scheduleType: "recurring",
  dogWarning: "none",
  gateCode: "",
  routeOrder: "100",
};

export default function LawnsPage() {
  const [lawns, setLawns] = useState<Lawn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLawns(await api<Lawn[]>("/api/lawns?all=1"));
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Failed to load lawns.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/lawns", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          chargeDollars: Number(form.chargeDollars),
          routeOrder: Number(form.routeOrder),
          city: "Topeka, KS",
        }),
      });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add lawn.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this lawn from the active schedule?")) return;
    try {
      await api(`/api/lawns/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  return (
    <main>
      <AppHeader compact subtitle="Yards on your route — recurring or one-time." />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <button
        type="button"
        className="btn-primary w-full"
        onClick={() => setShowForm((s) => !s)}
      >
        {showForm ? "Cancel" : "+ Add lawn"}
      </button>

      {showForm ? (
        <form onSubmit={onCreate} className="panel mt-3 space-y-3">
          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Johnson"
            />
          </div>
          <div>
            <label className="label" htmlFor="address">
              Address
            </label>
            <input
              id="address"
              className="input"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="4120 SW 29th St"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="charge">
                Charge ($)
              </label>
              <input
                id="charge"
                className="input"
                inputMode="decimal"
                value={form.chargeDollars}
                onChange={(e) =>
                  setForm({ ...form, chargeDollars: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label" htmlFor="size">
                Size
              </label>
              <select
                id="size"
                className="input"
                value={form.size}
                onChange={(e) => setForm({ ...form, size: e.target.value })}
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="xlarge">X-Large</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="sched">
                Schedule
              </label>
              <select
                id="sched"
                className="input"
                value={form.scheduleType}
                onChange={(e) =>
                  setForm({ ...form, scheduleType: e.target.value })
                }
              >
                <option value="recurring">Recurring</option>
                <option value="adhoc">One-time / adhoc</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="dog">
                Dog
              </label>
              <select
                id="dog"
                className="input"
                value={form.dogWarning}
                onChange={(e) =>
                  setForm({ ...form, dogWarning: e.target.value })
                }
              >
                <option value="none">None</option>
                <option value="friendly">Friendly</option>
                <option value="caution">Caution</option>
                <option value="do_not_enter">Do not enter</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="notes">
              Notes (gate, HOA, clippings…)
            </label>
            <textarea
              id="notes"
              className="input min-h-[88px]"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="gate">
              Gate code
            </label>
            <input
              id="gate"
              className="input"
              value={form.gateCode}
              onChange={(e) => setForm({ ...form, gateCode: e.target.value })}
            />
          </div>
          <button type="submit" className="btn-done w-full" disabled={busy}>
            {busy ? "Saving…" : "Save lawn"}
          </button>
        </form>
      ) : null}

      <ul className="mt-4 space-y-3">
        {lawns.map((lawn) => (
          <li key={lawn.id} className={`panel ${lawn.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link
                  href={`/lawns/${lawn.id}`}
                  className="font-display text-xl font-bold text-jd-green-deep underline-offset-2 hover:underline"
                >
                  {lawn.name}
                </Link>
                <p className="text-sm text-jd-soil/75">
                  {lawn.address || "No address"} · {dollars(lawn.chargeCents)} ·{" "}
                  {lawn.scheduleType}
                  {!lawn.active ? " · inactive" : ""}
                </p>
              </div>
              <button
                type="button"
                className="text-sm font-bold text-jd-danger"
                onClick={() => void remove(lawn.id)}
              >
                Remove
              </button>
            </div>
            {lawn.notes ? (
              <p className="mt-2 text-sm text-jd-soil/85">{lawn.notes}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
