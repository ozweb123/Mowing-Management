import { requireAuth } from "@/lib/auth";
import { assertRateLimit, clientKey, jsonErr, jsonOk, readJson } from "@/lib/api";
import { deleteMowing, getMowing, updatePayment } from "@/lib/mowings";
import { paymentUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    return jsonOk(getMowing(id));
  } catch (err) {
    return jsonErr(err);
  }
}

/** PATCH /api/mowings/:id — update payment status. */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    assertRateLimit(clientKey(req, "mow-write"), 40, 60_000);
    const { id } = await ctx.params;
    const body = await readJson(req);
    const parsed = paymentUpdateSchema.parse(body);
    return jsonOk(
      updatePayment(id, parsed.paymentStatus, parsed.paidAt ?? undefined)
    );
  } catch (err) {
    return jsonErr(err);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    assertRateLimit(clientKey(req, "mow-write"), 40, 60_000);
    const { id } = await ctx.params;
    deleteMowing(id);
    return jsonOk({ deleted: true });
  } catch (err) {
    return jsonErr(err);
  }
}
