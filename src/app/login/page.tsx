"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ClientApiError } from "@/lib/client-api";
import { ErrorBanner } from "@/components/ErrorBanner";

/**
 * PIN login — teen-friendly, no corporate password dance.
 * Default demo PIN is in .env.example (change after first login).
 */
export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ClientApiError
          ? err.message
          : "Could not sign in. Check your connection."
      );
    } finally {
      setBusy(false);
    }
  }

  function press(digit: string) {
    if (pin.length >= 8) return;
    setPin((p) => p + digit);
  }

  function backspace() {
    setPin((p) => p.slice(0, -1));
  }

  return (
    <main className="flex min-h-[85dvh] flex-col justify-center">
      <div className="jd-stripe mb-4 h-2 rounded-full" />
      <h1 className="font-display text-5xl font-black tracking-wide text-jd-green-deep animate-rise">
        MILES
        <br />
        <span className="text-jd-green">MOWING</span>
      </h1>
      <p className="mt-2 text-base font-medium text-jd-soil/80 animate-rise-delay-1">
        Management · Southwest Topeka
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4 animate-rise-delay-2">
        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        <div className="panel text-center">
          <p className="label text-center">Enter your PIN</p>
          <p
            className="my-3 font-mono text-3xl tracking-[0.4em] text-jd-green-deep"
            aria-live="polite"
          >
            {pin.replace(/./g, "•") || "····"}
          </p>
          {/* Hidden input for iOS password managers / accessibility */}
          <input
            className="sr-only"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin}
            onChange={(e) =>
              setPin(e.target.value.replace(/\D/g, "").slice(0, 8))
            }
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "Go"].map(
            (key) => {
              if (key === "⌫") {
                return (
                  <button
                    key={key}
                    type="button"
                    className="btn-secondary"
                    onClick={backspace}
                  >
                    ⌫
                  </button>
                );
              }
              if (key === "Go") {
                return (
                  <button
                    key={key}
                    type="submit"
                    className="btn-primary"
                    disabled={busy || pin.length < 4}
                  >
                    {busy ? "…" : "Go"}
                  </button>
                );
              }
              return (
                <button
                  key={key}
                  type="button"
                  className="btn-secondary text-xl"
                  onClick={() => press(key)}
                >
                  {key}
                </button>
              );
            }
          )}
        </div>
      </form>
    </main>
  );
}
