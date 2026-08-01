import { requireAuth } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/api";
import { buildTodayView } from "@/lib/today";

/** GET /api/today — morning dashboard payload. */
export async function GET() {
  try {
    await requireAuth();
    const view = await buildTodayView();
    return jsonOk(view);
  } catch (err) {
    return jsonErr(err);
  }
}
