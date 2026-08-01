/**
 * Centralized error types for consistent API + UI handling.
 * Keeps user-facing messages safe while logging detail server-side.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
    public readonly code: string = "APP_ERROR",
    public readonly expose = true
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "We couldn't find that.") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Some fields look off — check and try again.") {
    super(message, 400, "VALIDATION");
    this.name = "ValidationError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Slow down — too many tries. Wait a minute.") {
    super(message, 429, "RATE_LIMIT");
    this.name = "RateLimitError";
  }
}

/** Shape returned to the client from API routes. */
export type ApiErrorBody = {
  ok: false;
  error: { code: string; message: string };
};

export type ApiSuccessBody<T> = {
  ok: true;
  data: T;
};

export type ApiResult<T> = ApiSuccessBody<T> | ApiErrorBody;

/** Convert unknown thrown values into a safe JSON response payload. */
export function toErrorResponse(err: unknown): {
  body: ApiErrorBody;
  status: number;
} {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        ok: false,
        error: {
          code: err.code,
          message: err.expose ? err.message : "Something went wrong.",
        },
      },
    };
  }

  // Unexpected errors: log server-side, never leak stack/details to client.
  console.error("[MilesMowing] Unexpected error:", err);
  return {
    status: 500,
    body: {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "Something went wrong on our side. Try again in a bit.",
      },
    },
  };
}
