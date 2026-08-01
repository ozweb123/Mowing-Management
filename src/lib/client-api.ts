/**
 * Browser fetch helper — unwraps { ok, data } / { ok, error } envelopes.
 */

export class ClientApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

export async function api<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    credentials: "same-origin",
  });

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ClientApiError("Bad response from server.", "BAD_RESPONSE", res.status);
  }

  const body = json as {
    ok: boolean;
    data?: T;
    error?: { code: string; message: string };
  };

  if (!body.ok) {
    throw new ClientApiError(
      body.error?.message || "Request failed.",
      body.error?.code || "ERROR",
      res.status
    );
  }

  return body.data as T;
}

export function mapsUrl(address: string, city: string): string {
  const q = encodeURIComponent(`${address}, ${city}`);
  // Apple Maps works great in iOS Safari; falls back elsewhere.
  return `https://maps.apple.com/?q=${q}`;
}

export function smsUrl(message: string): string {
  return `sms:&body=${encodeURIComponent(message)}`;
}
