import { requireAuth } from "@/lib/auth";
import { assertRateLimit, clientKey, jsonErr, jsonOk, readJson } from "@/lib/api";
import { createMowing, listMowings } from "@/lib/mowings";
import { mowingCreateSchema } from "@/lib/validation";

/** GET /api/mowings?lawnId=&limit= */
export async function GET(req: Request) {
  try {
    await requireAuth();
    const url = new URL(req.url);
    const lawnId = url.searchParams.get("lawnId") ?? undefined;
    const limit = Number(url.searchParams.get("limit") ?? "100");
    return jsonOk(listMowings({ lawnId, limit: Math.min(limit, 500) }));
  } catch (err) {
    return jsonErr(err);
  }
}

/** POST /api/mowings — Mark a yard done. */
export async function POST(req: Request) {
  try {
    await requireAuth();
    assertRateLimit(clientKey(req, "mow-write"), 40, 60_000);
    const body = await readJson(req);
    const parsed = mowingCreateSchema.parse(body);
    return jsonOk(createMowing(parsed), 201);
  } catch (err) {
    return jsonErr(err);
  }
}
