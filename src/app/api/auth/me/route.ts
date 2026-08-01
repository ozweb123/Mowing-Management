import { isAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { jsonOk } from "@/lib/api";

/** GET /api/auth/me */
export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return jsonOk({ authenticated: false, ownerName: null });
  }
  const row = getDb()
    .prepare(`SELECT owner_name FROM settings WHERE id = 1`)
    .get() as { owner_name: string };
  return jsonOk({ authenticated: true, ownerName: row.owner_name });
}
