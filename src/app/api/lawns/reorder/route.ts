import { requireAuth } from "@/lib/auth";
import { assertRateLimit, clientKey, jsonErr, jsonOk, readJson } from "@/lib/api";
import { reorderLawns } from "@/lib/lawns";
import { z } from "zod";

const schema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
});

/** POST /api/lawns/reorder — set route order from an ordered id list. */
export async function POST(req: Request) {
  try {
    await requireAuth();
    assertRateLimit(clientKey(req, "lawn-write"), 30, 60_000);
    const body = await readJson(req);
    const { orderedIds } = schema.parse(body);
    reorderLawns(orderedIds);
    return jsonOk({ reordered: orderedIds.length });
  } catch (err) {
    return jsonErr(err);
  }
}
