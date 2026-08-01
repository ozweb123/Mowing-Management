import { requireAuth } from "@/lib/auth";
import { assertRateLimit, clientKey, jsonErr, jsonOk, readJson } from "@/lib/api";
import { deactivateLawn, deleteLawn, getLawn, updateLawn } from "@/lib/lawns";
import { lawnUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/lawns/:id */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    return jsonOk(getLawn(id));
  } catch (err) {
    return jsonErr(err);
  }
}

/** PATCH /api/lawns/:id */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    assertRateLimit(clientKey(req, "lawn-write"), 30, 60_000);
    const { id } = await ctx.params;
    const body = await readJson(req);
    const parsed = lawnUpdateSchema.parse(body);
    return jsonOk(updateLawn(id, parsed));
  } catch (err) {
    return jsonErr(err);
  }
}

/** DELETE /api/lawns/:id — soft delete by default; ?hard=1 hard deletes. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    assertRateLimit(clientKey(req, "lawn-write"), 30, 60_000);
    const { id } = await ctx.params;
    const hard = new URL(req.url).searchParams.get("hard") === "1";
    if (hard) deleteLawn(id);
    else deactivateLawn(id);
    return jsonOk({ deleted: true, hard });
  } catch (err) {
    return jsonErr(err);
  }
}
