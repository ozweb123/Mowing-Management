"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { api, ClientApiError } from "@/lib/client-api";
import {
  dowName,
  fmtHour,
  type BlockedSlot,
} from "@/lib/capacity-shared";

type Settings = {
  ownerName: string;
  savingsGoalCents: number;
  savingsLabel: string;
  gasEstimatePerYardCents: number;
  availableStartHour: number;
  availableEndHour: number;
  blocked: BlockedSlot[];
};

export default function MorePage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [goal, setGoal] = useState("");
  const [label, setLabel] = useState("");
  const [gas, setGas] = useState("");
  const [newPin, setNewPin] = useState("");
  const [startHour, setStartHour] = useState("8");
  const [endHour, setEndHour] = useState("18");
  const [blocked, setBlocked] = useState<BlockedSlot[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const s = await api<Settings>("/api/settings");
        setSettings(s);
        setOwnerName(s.ownerName);
        setGoal(String(s.savingsGoalCents / 100));
        setLabel(s.savingsLabel);
        setGas(String(s.gasEstimatePerYardCents / 100));
        setStartHour(String(s.availableStartHour));
        setEndHour(String(s.availableEndHour));
        setBlocked(s.blocked || []);
      } catch (e) {
        setError(
          e instanceof ClientApiError ? e.message : "Could not load settings."
        );
      }
    })();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          ownerName,
          savingsGoalDollars: Number(goal),
          savingsLabel: label,
          gasEstimatePerYardDollars: Number(gas),
          availableStartHour: Number(startHour),
          availableEndHour: Number(endHour),
          blocked,
          ...(newPin ? { newPin } : {}),
        }),
      });
      setNewPin("");
      setMsg("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  function addBlock() {
    setBlocked((b) => [
      ...b,
      { dow: 2, startHour: 15, endHour: 19, label: "Practice" },
    ]);
  }

  function updateBlock(idx: number, patch: Partial<BlockedSlot>) {
    setBlocked((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    );
  }

  function removeBlock(idx: number) {
    setBlocked((rows) => rows.filter((_, i) => i !== idx));
  }

  return (
    <main>
      <AppHeader compact subtitle="Settings, free time, history." />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {msg ? (
        <p className="mb-3 rounded-xl bg-jd-ok/15 px-3 py-2 text-sm font-semibold text-jd-ok">
          {msg}
        </p>
      ) : null}

      <div className="mb-4 grid gap-2">
        <Link href="/week" className="btn-secondary justify-start">
          Week planner →
        </Link>
        <Link href="/weather" className="btn-secondary justify-start">
          10-day weather →
        </Link>
        <Link href="/history" className="btn-secondary justify-start">
          Mow history →
        </Link>
        <Link href="/schedule" className="btn-secondary justify-start">
          Full forecast list →
        </Link>
      </div>

      <section className="panel mb-4">
        <h2 className="font-display text-lg font-bold text-jd-green-deep">
          Equipment checklist
        </h2>
        <ul className="mt-2 space-y-1 text-sm">
          <li>☐ Gas can topped off</li>
          <li>☐ Check oil level</li>
          <li>☐ Blade sharp / inspect for dings</li>
          <li>☐ Tire pressure / air filter glance</li>
          <li>☐ Water bottle + sunscreen (Topeka heat)</li>
          <li>☐ Phone charged for Navigate / Done</li>
        </ul>
      </section>

      <form onSubmit={save} className="panel space-y-3">
        <h2 className="font-display text-lg font-bold">Settings</h2>
        <div>
          <label className="label" htmlFor="owner">
            Your name
          </label>
          <input
            id="owner"
            className="input"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="label">
            Savings label
          </label>
          <input
            id="label"
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="goal">
              Goal ($)
            </label>
            <input
              id="goal"
              className="input"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="gas">
              Gas / yard ($)
            </label>
            <input
              id="gas"
              className="input"
              value={gas}
              onChange={(e) => setGas(e.target.value)}
            />
          </div>
        </div>

        <h3 className="pt-2 font-display text-base font-bold text-jd-green-deep">
          Free time (capacity)
        </h3>
        <p className="text-xs text-jd-soil/70">
          Today & Week use this so you don&apos;t stack 6 yards on practice night.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="start">
              Start hour (0–23)
            </label>
            <input
              id="start"
              className="input"
              inputMode="numeric"
              value={startHour}
              onChange={(e) => setStartHour(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="end">
              End hour (0–23)
            </label>
            <input
              id="end"
              className="input"
              inputMode="numeric"
              value={endHour}
              onChange={(e) => setEndHour(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs font-semibold text-jd-green-dark">
          Window: {fmtHour(Number(startHour) || 8)}–{fmtHour(Number(endHour) || 18)}
        </p>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="label mb-0">School / sports blocks</p>
            <button
              type="button"
              className="text-sm font-bold text-jd-green"
              onClick={addBlock}
            >
              + Add
            </button>
          </div>
          {blocked.map((b, idx) => (
            <div
              key={idx}
              className="space-y-2 rounded-xl border border-jd-green/15 bg-white/70 p-3"
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Day</label>
                  <select
                    className="input"
                    value={b.dow}
                    onChange={(e) =>
                      updateBlock(idx, { dow: Number(e.target.value) })
                    }
                  >
                    {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                      <option key={d} value={d}>
                        {dowName(d)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Label</label>
                  <input
                    className="input"
                    value={b.label}
                    onChange={(e) => updateBlock(idx, { label: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">From</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={b.startHour}
                    onChange={(e) =>
                      updateBlock(idx, { startHour: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="label">To</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={b.endHour}
                    onChange={(e) =>
                      updateBlock(idx, { endHour: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <button
                type="button"
                className="text-sm font-bold text-jd-danger"
                onClick={() => removeBlock(idx)}
              >
                Remove block
              </button>
            </div>
          ))}
          {!blocked.length ? (
            <p className="text-sm text-jd-soil/60">No blocks — full days open.</p>
          ) : null}
        </div>

        <div>
          <label className="label" htmlFor="pin">
            New PIN (optional, 4–8 digits)
          </label>
          <input
            id="pin"
            className="input"
            inputMode="numeric"
            autoComplete="new-password"
            value={newPin}
            onChange={(e) =>
              setNewPin(e.target.value.replace(/\D/g, "").slice(0, 8))
            }
            placeholder="Leave blank to keep"
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={!settings}>
          Save settings
        </button>
      </form>

      <button
        type="button"
        className="btn-danger mt-4 w-full"
        onClick={() => void logout()}
      >
        Sign out
      </button>

      <p className="mt-6 text-center text-xs text-jd-soil/50">
        Miles Mowing Management v1 · Built for SW Topeka
      </p>
    </main>
  );
}
