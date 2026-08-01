"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { api, ClientApiError } from "@/lib/client-api";
import { dollars } from "@/lib/forecast";
import type { Expense } from "@/lib/types";

type MoneyPayload = {
  summary: {
    savingsGoalCents: number;
    savingsLabel: string;
    savedTowardGoalCents: number;
    day: { earnedCents: number; paidCents: number; owesCents: number; expenseCents: number; profitCents: number };
    week: { earnedCents: number; paidCents: number; owesCents: number; expenseCents: number; profitCents: number };
    month: { earnedCents: number; paidCents: number; owesCents: number; expenseCents: number; profitCents: number };
    season: { earnedCents: number; paidCents: number; owesCents: number; expenseCents: number; profitCents: number };
    outstanding: Array<{
      id: string;
      lawnName: string;
      amountCents: number;
      mowedAt: string;
      paymentStatus: string;
    }>;
  };
  expenses: Expense[];
};

export default function MoneyPage() {
  const [data, setData] = useState<MoneyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("gas");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<MoneyPayload>("/api/money"));
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Money load failed.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addExpense(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          category,
          amountDollars: Number(amount),
          note,
        }),
      });
      setAmount("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add expense.");
    }
  }

  async function markPaid(id: string) {
    await api(`/api/mowings/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ paymentStatus: "paid" }),
    });
    await load();
  }

  const s = data?.summary;
  const progress =
    s && s.savingsGoalCents > 0
      ? Math.min(100, Math.round((s.savedTowardGoalCents / s.savingsGoalCents) * 100))
      : 0;

  return (
    <main>
      <AppHeader compact subtitle="Who paid, who owes, gas, truck fund." />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {s ? (
        <>
          <section className="panel animate-rise border-l-4 border-l-jd-yellow">
            <p className="text-sm font-semibold text-jd-green-dark">
              {s.savingsLabel}
            </p>
            <p className="font-display text-3xl font-bold text-jd-green-deep">
              {dollars(s.savedTowardGoalCents)}{" "}
              <span className="text-lg text-jd-soil/60">
                / {dollars(s.savingsGoalCents)}
              </span>
            </p>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-jd-green/15">
              <div
                className="h-full rounded-full bg-jd-green transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </section>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {(
              [
                ["Today", s.day],
                ["Week", s.week],
                ["Month", s.month],
                ["Season", s.season],
              ] as const
            ).map(([label, block]) => (
              <div key={label} className="panel">
                <p className="text-xs font-bold uppercase text-jd-green-dark">
                  {label}
                </p>
                <p className="font-display text-xl font-bold">
                  {dollars(block.paidCents)}
                </p>
                <p className="text-xs text-jd-soil/70">
                  Earned {dollars(block.earnedCents)} · Exp{" "}
                  {dollars(block.expenseCents)}
                </p>
              </div>
            ))}
          </div>

          <h2 className="mb-2 mt-6 font-display text-lg font-bold text-jd-danger">
            Owes ({dollars(s.day.owesCents)})
          </h2>
          <ul className="space-y-2">
            {s.outstanding.map((o) => (
              <li
                key={o.id}
                className="panel flex items-center justify-between gap-2"
              >
                <div>
                  <p className="font-bold">{o.lawnName}</p>
                  <p className="text-sm text-jd-soil/70">
                    {new Date(o.mowedAt).toLocaleDateString()} ·{" "}
                    {dollars(o.amountCents)}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primary px-3 py-2 text-sm"
                  onClick={() => void markPaid(o.id)}
                >
                  Paid
                </button>
              </li>
            ))}
            {!s.outstanding.length ? (
              <li className="panel text-sm text-jd-ok">
                Nobody owes you — nice.
              </li>
            ) : null}
          </ul>
        </>
      ) : null}

      <h2 className="mb-2 mt-6 font-display text-lg font-bold">Log expense</h2>
      <form onSubmit={addExpense} className="panel space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="cat">
              Category
            </label>
            <select
              id="cat"
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="gas">Gas</option>
              <option value="blades">Blades</option>
              <option value="oil">Oil</option>
              <option value="parts">Parts</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="amt">
              Amount ($)
            </label>
            <input
              id="amt"
              className="input"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        <input
          className="input"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="btn-secondary w-full">
          Add expense
        </button>
      </form>

      <ul className="mt-3 space-y-2">
        {(data?.expenses ?? []).slice(0, 10).map((ex) => (
          <li key={ex.id} className="panel flex justify-between text-sm">
            <span className="capitalize">
              {ex.category}
              {ex.note ? ` · ${ex.note}` : ""}
            </span>
            <span className="font-bold">{dollars(ex.amountCents)}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
