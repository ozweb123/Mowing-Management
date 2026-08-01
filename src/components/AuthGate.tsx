"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client-api";

/**
 * Lightweight client gate — redirects to /login if session cookie is missing/invalid.
 * APIs still enforce auth server-side (never trust the client alone).
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(pathname === "/login");

  useEffect(() => {
    if (pathname === "/login") {
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await api<{ authenticated: boolean }>("/api/auth/me");
        if (!cancelled) {
          if (!me.authenticated) router.replace("/login");
          else setReady(true);
        }
      } catch {
        if (!cancelled) router.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center field-texture">
        <p className="font-display text-lg font-bold text-jd-green-deep">
          Firing up the mower…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
