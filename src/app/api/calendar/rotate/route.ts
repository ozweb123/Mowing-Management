import { requireAuth } from "@/lib/auth";
import { assertRateLimit, clientKey, jsonErr, jsonOk } from "@/lib/api";
import { rotateCalendarToken } from "@/lib/calendar-token";

/** POST /api/calendar/rotate — invalidate old subscribe links. */
export async function POST(req: Request) {
  try {
    await requireAuth();
    assertRateLimit(clientKey(req, "cal-rotate"), 10, 60_000);
    const token = rotateCalendarToken();
    return jsonOk({
      token,
      subscribePath: `/api/calendar?token=${encodeURIComponent(token)}`,
    });
  } catch (err) {
    return jsonErr(err);
  }
}
