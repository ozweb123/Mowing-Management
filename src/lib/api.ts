/**
 * Shared helpers for App Router API handlers.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  ApiResult,
  RateLimitError,
  ValidationError,
  toErrorResponse,
} from "./errors";
import { checkRateLimit } from "./rate-limit";

export function jsonOk<T>(data: T, status = 200): NextResponse<ApiResult<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

export function jsonErr(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    const message = err.errors.map((e) => e.message).join("; ");
    return NextResponse.json(
      {
        ok: false,
        error: { code: "VALIDATION", message: message || "Invalid input." },
      },
      { status: 400 }
    );
  }
  const { body, status } = toErrorResponse(err);
  return NextResponse.json(body, { status });
}

/** Enforce rate limit or throw RateLimitError. */
export function assertRateLimit(
  key: string,
  limit: number,
  windowMs: number
): void {
  const result = checkRateLimit(key, limit, windowMs);
  if (!result.allowed) {
    throw new RateLimitError(
      `Too many requests. Try again in ${result.retryAfterSec}s.`
    );
  }
}

/** Parse JSON body safely. */
export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
}

/**
 * Rate-limit bucket key. Intentionally ignores client-spoofable X-Forwarded-For
 * unless TRUST_PROXY=1 (set only when behind a reverse proxy that strips/forwards XFF).
 */
export function clientKey(req: Request, suffix: string): string {
  if (process.env.TRUST_PROXY === "1") {
    const fwd = req.headers.get("x-forwarded-for");
    const ip = fwd?.split(",")[0]?.trim();
    if (ip) return `${suffix}:${ip}`;
  }
  return suffix;
}
