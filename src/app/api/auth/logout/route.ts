import { COOKIE_NAME, destroySession, sessionCookieOptions } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/api";

/** POST /api/auth/logout — clears server session + cookie. */
export async function POST() {
  try {
    await destroySession();
    const res = jsonOk({ signedIn: false });
    res.cookies.set(COOKIE_NAME, "", { ...sessionCookieOptions(0), maxAge: 0 });
    return res;
  } catch (err) {
    return jsonErr(err);
  }
}
