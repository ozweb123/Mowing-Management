import { requireAuth } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/api";
import { buildWeekView } from "@/lib/week";

/** GET /api/week — 7-day weather planner with capacity + dry-window suggestions. */
export async function GET() {
  try {
    await requireAuth();
    const view = await buildWeekView(7);
    return jsonOk(view);
  } catch (err) {
    return jsonErr(err);
  }
}
