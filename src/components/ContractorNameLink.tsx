"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchContractorsSearchCached,
  peekContractorsSearchCache,
} from "@/lib/contractors/contractors-search-cache";
import { normalizeContractorName } from "@/lib/contractors/normalize-contractor-name";

type ContractorAlias = {
  aliasName: string;
  normalizedAlias: string;
};

type ContractorRow = {
  id: string;
  displayName: string;
  normalizedName: string;
  aliases: ContractorAlias[];
};

function matchContractor(name: string, rows: ContractorRow[]): ContractorRow | null {
  const normalized = normalizeContractorName(name);
  if (!normalized) return null;
  return (
    rows.find((row) => row.normalizedName === normalized) ??
    rows.find((row) => row.aliases.some((alias) => alias.normalizedAlias === normalized)) ??
    null
  );
}

export function ContractorNameLink({
  name,
  fallback = "—",
  className = "text-blue-700 underline dark:text-blue-300",
}: {
  name: string | null | undefined;
  fallback?: string;
  className?: string;
}) {
  const display = name?.trim();
  const [match, setMatch] = useState<ContractorRow | null>(null);

  useEffect(() => {
    if (!display) {
      setMatch(null);
      return;
    }
    const cached = peekContractorsSearchCache(display);
    if (cached !== undefined) {
      setMatch(matchContractor(display, cached as ContractorRow[]));
      return;
    }
    let cancelled = false;
    void fetchContractorsSearchCached(display)
      .then((rows) => {
        if (cancelled) return;
        setMatch(matchContractor(display, rows as ContractorRow[]));
      })
      .catch(() => {
        if (!cancelled) setMatch(null);
      });
    return () => {
      cancelled = true;
    };
  }, [display]);

  if (!display) return <>{fallback}</>;
  if (!match) return <>{display}</>;
  return (
    <Link href={`/contractors/${match.id}`} className={className} title={`Kontrahent: ${match.displayName}`}>
      {display}
    </Link>
  );
}
