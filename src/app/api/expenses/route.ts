import { requireAuth } from "@/lib/auth";
import { assertRateLimit, clientKey, jsonErr, jsonOk, readJson } from "@/lib/api";
import { createExpense, listExpenses } from "@/lib/money";
import { expenseCreateSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireAuth();
    return jsonOk(listExpenses());
  } catch (err) {
    return jsonErr(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAuth();
    assertRateLimit(clientKey(req, "expense-write"), 30, 60_000);
    const body = await readJson(req);
    const parsed = expenseCreateSchema.parse(body);
    const expense = createExpense({
      category: parsed.category,
      amountCents: Math.round(parsed.amountDollars * 100),
      note: parsed.note,
      spentAt: parsed.spentAt,
    });
    return jsonOk(expense, 201);
  } catch (err) {
    return jsonErr(err);
  }
}
