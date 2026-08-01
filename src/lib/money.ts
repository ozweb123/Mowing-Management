/**
 * Earnings, expenses, savings goal — money in integer cents.
 */

import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import { NotFoundError } from "./errors";
import type { Expense } from "./types";

type ExpenseRow = {
  id: string;
  category: Expense["category"];
  amount_cents: number;
  note: string;
  spent_at: string;
  created_at: string;
};

function rowToExpense(r: ExpenseRow): Expense {
  return {
    id: r.id,
    category: r.category,
    amountCents: r.amount_cents,
    note: r.note,
    spentAt: r.spent_at,
    createdAt: r.created_at,
  };
}

export function listExpenses(limit = 100): Expense[] {
  const rows = getDb()
    .prepare(`SELECT * FROM expenses ORDER BY spent_at DESC LIMIT ?`)
    .all(limit) as ExpenseRow[];
  return rows.map(rowToExpense);
}

export function createExpense(input: {
  category: Expense["category"];
  amountCents: number;
  note: string;
  spentAt?: string;
}): Expense {
  const id = uuid();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO expenses (id, category, amount_cents, note, spent_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.category,
      input.amountCents,
      input.note,
      input.spentAt ?? now,
      now
    );
  return getExpense(id);
}

export function getExpense(id: string): Expense {
  const row = getDb()
    .prepare(`SELECT * FROM expenses WHERE id = ?`)
    .get(id) as ExpenseRow | undefined;
  if (!row) throw new NotFoundError("Expense not found.");
  return rowToExpense(row);
}

export function deleteExpense(id: string): void {
  getExpense(id);
  getDb().prepare(`DELETE FROM expenses WHERE id = ?`).run(id);
}

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d = new Date()): Date {
  const x = startOfDay(d);
  // Week starts Sunday (teen schedule vibe)
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function startOfMonth(d = new Date()): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

type MoneyAgg = {
  earnedCents: number;
  paidCents: number;
  owesCents: number;
  expenseCents: number;
  profitCents: number;
};

function sumMowingsSince(iso: string): {
  earned: number;
  paid: number;
  owes: number;
} {
  const db = getDb();
  const earned = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents),0) AS s FROM mowings WHERE mowed_at >= ?`
      )
      .get(iso) as { s: number }
  ).s;
  const paid = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents),0) AS s FROM mowings
         WHERE mowed_at >= ? AND payment_status = 'paid'`
      )
      .get(iso) as { s: number }
  ).s;
  const owes = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents),0) AS s FROM mowings
         WHERE payment_status IN ('owes','partial')`
      )
      .get() as { s: number }
  ).s;
  return { earned, paid, owes };
}

function sumExpensesSince(iso: string): number {
  return (
    getDb()
      .prepare(
        `SELECT COALESCE(SUM(amount_cents),0) AS s FROM expenses WHERE spent_at >= ?`
      )
      .get(iso) as { s: number }
  ).s;
}

function periodStats(since: Date): MoneyAgg {
  const iso = since.toISOString();
  const { earned, paid, owes } = sumMowingsSince(iso);
  const expenseCents = sumExpensesSince(iso);
  return {
    earnedCents: earned,
    paidCents: paid,
    owesCents: owes,
    expenseCents,
    profitCents: paid - expenseCents,
  };
}

export function getMoneySummary() {
  const settings = getDb()
    .prepare(
      `SELECT savings_goal_cents, savings_label, gas_estimate_per_yard_cents, owner_name
       FROM settings WHERE id = 1`
    )
    .get() as {
    savings_goal_cents: number;
    savings_label: string;
    gas_estimate_per_yard_cents: number;
    owner_name: string;
  };

  // Season-to-date ≈ since March 1 of current year (or last year if before March)
  const now = new Date();
  const seasonStart = new Date(now.getFullYear(), 2, 1); // March 1
  if (now < seasonStart) seasonStart.setFullYear(seasonStart.getFullYear() - 1);

  const day = periodStats(startOfDay(now));
  const week = periodStats(startOfWeek(now));
  const month = periodStats(startOfMonth(now));
  const season = periodStats(seasonStart);

  // Savings progress uses season paid earnings minus season expenses (simple)
  const savedTowardGoal = Math.max(0, season.profitCents);

  // Outstanding invoices with lawn names
  const outstanding = getDb()
    .prepare(
      `SELECT m.id, m.amount_cents, m.mowed_at, m.payment_status, l.name AS lawn_name
       FROM mowings m JOIN lawns l ON l.id = m.lawn_id
       WHERE m.payment_status IN ('owes','partial')
       ORDER BY m.mowed_at DESC LIMIT 50`
    )
    .all() as Array<{
    id: string;
    amount_cents: number;
    mowed_at: string;
    payment_status: string;
    lawn_name: string;
  }>;

  return {
    ownerName: settings.owner_name,
    savingsGoalCents: settings.savings_goal_cents,
    savingsLabel: settings.savings_label,
    savedTowardGoalCents: savedTowardGoal,
    gasEstimatePerYardCents: settings.gas_estimate_per_yard_cents,
    day,
    week,
    month,
    season,
    outstanding: outstanding.map((o) => ({
      id: o.id,
      lawnName: o.lawn_name,
      amountCents: o.amount_cents,
      mowedAt: o.mowed_at,
      paymentStatus: o.payment_status,
    })),
  };
}
