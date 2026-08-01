"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { api, ClientApiError } from "@/lib/client-api";

type Settings = {
  ownerName: string;
  savingsGoalCents: number;
  savingsLabel: string;
  gasEstimatePerYardCents: number;
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

  useEffect(() => {
    (async () => {
      try {
        const s = await api<Settings>("/api/settings");
        setSettings(s);
        setOwnerName(s.ownerName);
        setGoal(String(s.savingsGoalCents / 100));
        setLabel(s.savingsLabel);
        setGas(String(s.gasEstimatePerYardCents / 100));
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

  return (
    <main>
      <AppHeader compact subtitle="Settings, history, equipment reminders." />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {msg ? (
        <p className="mb-3 rounded-xl bg-jd-ok/15 px-3 py-2 text-sm font-semibold text-jd-ok">
          {msg}
        </p>
      ) : null}

      <div className="mb-4 grid gap-2">
        <Link href="/history" className="btn-secondary justify-start">
          Mow history →
        </Link>
        <Link href="/schedule" className="btn-secondary justify-start">
          Full schedule / forecast →
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
