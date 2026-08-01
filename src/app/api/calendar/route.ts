import { buildIcs } from "@/lib/calendar";
import { assertCalendarToken, getCalendarToken } from "@/lib/calendar-token";
import { requireAuth } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/api";

/**
 * GET /api/calendar?token=...  → text/calendar ICS feed (for iPhone subscribe)
 * GET /api/calendar (authed)   → JSON { token, path } helper for Settings UI
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (token) {
      if (!assertCalendarToken(token)) {
        return new Response("Unauthorized", { status: 401 });
      }
      const ics = await buildIcs("Miles Mowing");
      return new Response(ics, {
        status: 200,
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": 'inline; filename="miles-mowing.ics"',
          "Cache-Control": "no-cache, max-age=0",
        },
      });
    }

    await requireAuth();
    const t = getCalendarToken();
    return jsonOk({
      token: t,
      subscribePath: `/api/calendar?token=${encodeURIComponent(t)}`,
    });
  } catch (err) {
    return jsonErr(err);
  }
}
