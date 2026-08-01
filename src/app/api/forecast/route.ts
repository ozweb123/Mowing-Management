import { requireAuth } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/api";
import { forecastLawn, getSeason } from "@/lib/forecast";
import { listLawns } from "@/lib/lawns";
import { lastMowedAt } from "@/lib/mowings";
import { fetchWeatherForecast } from "@/lib/weather";

/** GET /api/forecast — next-mow forecasts for all active lawns. */
export async function GET() {
  try {
    await requireAuth();
    const weather = await fetchWeatherForecast();
    const lawns = listLawns(false);
    const forecasts = lawns.map((lawn) => ({
      lawn,
      forecast: forecastLawn(lawn, lastMowedAt(lawn.id), weather),
    }));
    return jsonOk({ season: getSeason(), forecasts });
  } catch (err) {
    return jsonErr(err);
  }
}
