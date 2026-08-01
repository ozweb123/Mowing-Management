import { requireAuth, updatePin } from "@/lib/auth";
import { assertRateLimit, clientKey, jsonErr, jsonOk, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { settingsUpdateSchema } from "@/lib/validation";

/** GET /api/settings */
export async function GET() {
  try {
    await requireAuth();
    const row = getDb()
      .prepare(
        `SELECT owner_name, savings_goal_cents, savings_label,
                gas_estimate_per_yard_cents, base_lat, base_lon, timezone
         FROM settings WHERE id = 1`
      )
      .get() as {
      owner_name: string;
      savings_goal_cents: number;
      savings_label: string;
      gas_estimate_per_yard_cents: number;
      base_lat: number;
      base_lon: number;
      timezone: string;
    };
    return jsonOk({
      ownerName: row.owner_name,
      savingsGoalCents: row.savings_goal_cents,
      savingsLabel: row.savings_label,
      gasEstimatePerYardCents: row.gas_estimate_per_yard_cents,
      baseLat: row.base_lat,
      baseLon: row.base_lon,
      timezone: row.timezone,
    });
  } catch (err) {
    return jsonErr(err);
  }
}

/** PATCH /api/settings */
export async function PATCH(req: Request) {
  try {
    await requireAuth();
    assertRateLimit(clientKey(req, "settings"), 20, 60_000);
    const body = await readJson(req);
    const parsed = settingsUpdateSchema.parse(body);
    const db = getDb();

    if (parsed.ownerName != null) {
      db.prepare(`UPDATE settings SET owner_name = ? WHERE id = 1`).run(
        parsed.ownerName
      );
    }
    if (parsed.savingsGoalDollars != null) {
      db.prepare(
        `UPDATE settings SET savings_goal_cents = ? WHERE id = 1`
      ).run(Math.round(parsed.savingsGoalDollars * 100));
    }
    if (parsed.savingsLabel != null) {
      db.prepare(`UPDATE settings SET savings_label = ? WHERE id = 1`).run(
        parsed.savingsLabel
      );
    }
    if (parsed.gasEstimatePerYardDollars != null) {
      db.prepare(
        `UPDATE settings SET gas_estimate_per_yard_cents = ? WHERE id = 1`
      ).run(Math.round(parsed.gasEstimatePerYardDollars * 100));
    }
    if (parsed.newPin) {
      updatePin(parsed.newPin);
    }

    return jsonOk({ updated: true });
  } catch (err) {
    return jsonErr(err);
  }
}
