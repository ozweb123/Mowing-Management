import { requireAuth } from "@/lib/auth";
import { assertRateLimit, clientKey, jsonErr, jsonOk, readJson } from "@/lib/api";
import { getLawn } from "@/lib/lawns";
import { setPlannedMowDate } from "@/lib/week";
import { z } from "zod";

const schema = z.object({
  lawnId: z.string().uuid(),
  /** YYYY-MM-DD or null to clear pin */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
    .nullable(),
});

/** POST /api/week/plan — pin a lawn to a calendar day (or clear). */
export async function POST(req: Request) {
  try {
    await requireAuth();
    assertRateLimit(clientKey(req, "week-plan"), 40, 60_000);
    const body = await readJson(req);
    const parsed = schema.parse(body);
    getLawn(parsed.lawnId); // 404 if missing
    setPlannedMowDate(parsed.lawnId, parsed.date);
    return jsonOk({ lawnId: parsed.lawnId, plannedMowDate: parsed.date });
  } catch (err) {
    return jsonErr(err);
  }
}
