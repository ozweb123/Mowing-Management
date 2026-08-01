import { NextResponse } from "next/server";
import {
  createSession,
  sessionCookieOptions,
  SESSION_DAYS,
  verifyPin,
} from "@/lib/auth";
import { assertRateLimit, clientKey, jsonErr, jsonOk, readJson } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { pinSchema } from "@/lib/validation";

/** POST /api/auth/login — PIN login with rate limiting. */
export async function POST(req: Request) {
  try {
    assertRateLimit(clientKey(req, "login"), 8, 60_000);
    const body = await readJson<{ pin?: string }>(req);
    const pin = pinSchema.parse(body.pin ?? "");

    if (!verifyPin(pin)) {
      // Same rate bucket burns on bad PINs to slow guessing.
      throw new ValidationError("Wrong PIN. Try again.");
    }

    const token = createSession();
    const res = jsonOk({ signedIn: true });
    const opts = sessionCookieOptions(SESSION_DAYS * 24 * 60 * 60);
    res.cookies.set(opts.name, token, opts);
    return res;
  } catch (err) {
    return jsonErr(err);
  }
}
