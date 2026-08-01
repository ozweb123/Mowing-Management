import { requireAuth } from "@/lib/auth";
import { assertRateLimit, clientKey, jsonErr, jsonOk, readJson } from "@/lib/api";
import { createLawn, listLawns } from "@/lib/lawns";
import { lawnCreateSchema } from "@/lib/validation";

/** GET /api/lawns */
export async function GET(req: Request) {
  try {
    await requireAuth();
    const url = new URL(req.url);
    const all = url.searchParams.get("all") === "1";
    return jsonOk(listLawns(all));
  } catch (err) {
    return jsonErr(err);
  }
}

/** POST /api/lawns */
export async function POST(req: Request) {
  try {
    await requireAuth();
    assertRateLimit(clientKey(req, "lawn-write"), 30, 60_000);
    const body = await readJson(req);
    const parsed = lawnCreateSchema.parse(body);
    const lawn = createLawn(parsed);
    return jsonOk(lawn, 201);
  } catch (err) {
    return jsonErr(err);
  }
}
