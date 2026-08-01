"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Today" },
  { href: "/week", label: "Week" },
  { href: "/lawns", label: "Lawns" },
  { href: "/money", label: "Money" },
  { href: "/more", label: "More" },
];

/**
 * Fixed bottom nav sized for one-thumb iPhone use (sweaty hands friendly).
 */
export function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t-2 border-jd-green/20 bg-jd-green-deep/95 text-jd-cream backdrop-blur-md"
      style={{ paddingBottom: "var(--safe-bottom)" }}
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1 pt-1">
        {links.map((l) => {
          const active =
            l.href === "/"
              ? pathname === "/"
              : pathname.startsWith(l.href);
          return (
            <li key={l.href} className="flex-1">
              <Link
                href={l.href}
                className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl text-xs font-bold tracking-wide transition ${
                  active
                    ? "bg-jd-yellow text-jd-green-deep"
                    : "text-jd-cream/85 active:bg-white/10"
                }`}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
