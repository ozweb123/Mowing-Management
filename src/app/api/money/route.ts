import { requireAuth } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/api";
import { getMoneySummary, listExpenses } from "@/lib/money";

/** GET /api/money — earnings, owes, savings, expenses. */
export async function GET() {
  try {
    await requireAuth();
    return jsonOk({
      summary: getMoneySummary(),
      expenses: listExpenses(50),
    });
  } catch (err) {
    return jsonErr(err);
  }
}
