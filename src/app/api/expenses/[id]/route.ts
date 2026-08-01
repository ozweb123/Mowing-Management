import { requireAuth } from "@/lib/auth";
import { assertRateLimit, clientKey, jsonErr, jsonOk } from "@/lib/api";
import { deleteExpense } from "@/lib/money";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    assertRateLimit(clientKey(req, "expense-write"), 30, 60_000);
    const { id } = await ctx.params;
    deleteExpense(id);
    return jsonOk({ deleted: true });
  } catch (err) {
    return jsonErr(err);
  }
}
