import { requireAuth } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/api";
import { fetchWeatherForecast } from "@/lib/weather";

/** GET /api/weather — 10-day period forecast for SW Topeka. */
export async function GET(req: Request) {
  try {
    await requireAuth();
    const force = new URL(req.url).searchParams.get("refresh") === "1";
    const days = await fetchWeatherForecast(force);
    return jsonOk({ location: "Southwest Topeka, KS", days });
  } catch (err) {
    return jsonErr(err);
  }
}
