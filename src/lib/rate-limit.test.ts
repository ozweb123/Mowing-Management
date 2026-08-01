import { describe, expect, it, beforeEach } from "vitest";
import { _resetRateLimitsForTests, checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => _resetRateLimitsForTests());

  it("allows under the limit", () => {
    expect(checkRateLimit("t", 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit("t", 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit("t", 3, 60_000).allowed).toBe(true);
  });

  it("blocks over the limit", () => {
    checkRateLimit("t2", 2, 60_000);
    checkRateLimit("t2", 2, 60_000);
    expect(checkRateLimit("t2", 2, 60_000).allowed).toBe(false);
  });
});
