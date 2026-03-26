"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/forecast", label: "Prognoza" },
  { href: "/income-invoices", label: "Przychody" },
  { href: "/cost-invoices", label: "Koszty" },
  { href: "/planned-events", label: "Zdarzenia" },
  { href: "/recurring", label: "Powtarzalne" },
  { href: "/settings", label: "Ustawienia" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {links.map((l) => {
        const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              active
                ? "rounded-md bg-zinc-900 px-2 py-1.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded-md px-2 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
