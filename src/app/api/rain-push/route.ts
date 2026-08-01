import { requireAuth } from "@/lib/auth";
import { assertRateLimit, clientKey, jsonErr, jsonOk, readJson } from "@/lib/api";
import { activateRainPush, clearRainPush } from "@/lib/today";
import { rainPushSchema } from "@/lib/validation";

/** POST /api/rain-push — "Rain day — push all N day(s)". */
export async function POST(req: Request) {
  try {
    await requireAuth();
    assertRateLimit(clientKey(req, "rain-push"), 10, 60_000);
    const body = await readJson(req);
    const parsed = rainPushSchema.parse(body);
    const until = activateRainPush(parsed.days);
    return jsonOk({ rainPushUntil: until, days: parsed.days });
  } catch (err) {
    return jsonErr(err);
  }
}

/** DELETE /api/rain-push — clear manual rain push. */
export async function DELETE() {
  try {
    await requireAuth();
    clearRainPush();
    return jsonOk({ cleared: true });
  } catch (err) {
    return jsonErr(err);
  }
}
