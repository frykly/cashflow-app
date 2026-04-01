import type { CostInvoice, IncomeInvoice } from "@prisma/client";
import { decToNumber } from "@/lib/cashflow/money";

const DAY_MS = 86_400_000;
const GROSZ_EPS = 2;

function grossToGrosze(d: unknown): number {
  return Math.round(decToNumber(d as never) * 100);
}

function daysApart(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / DAY_MS;
}

function dateScore(days: number): number {
  if (days <= 3) return 3;
  if (days <= 7) return 2;
  if (days <= 14) return 1;
  return 0;
}

/** Proste tokeny z opisu banku i faktury do dopasowania słownego. */
function tokenOverlap(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((w) => w.length >= 3);
  const ta = new Set(norm(a));
  const tb = new Set(norm(b));
  let n = 0;
  for (const t of ta) {
    if (tb.has(t)) n += 1;
  }
  return Math.min(n, 3);
}

/** Szuka numerów dokumentów w opisie (FV, FA, itp.). */
function extractDocHints(text: string): string[] {
  const out: string[] = [];
  const re = /(?:FV|FA|Faktura|Nr\.?)\s*[:\s#]*([A-Z0-9][A-Z0-9\/\-\s]{2,40})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[1]?.replace(/\s+/g, " ").trim();
    if (t) out.push(t.toUpperCase());
  }
  return [...new Set(out)];
}

function docHintScore(hints: string[], docNumber: string): number {
  const dn = docNumber.toUpperCase().replace(/\s+/g, "");
  for (const h of hints) {
    const hh = h.replace(/\s+/g, "");
    if (hh.length >= 4 && (dn.includes(hh) || hh.includes(dn))) return 5;
  }
  return 0;
}

export type CostSuggestion = {
  id: string;
  documentNumber: string;
  supplier: string;
  grossAmount: string;
  documentDate: string;
  score: number;
};

export type IncomeSuggestion = {
  id: string;
  invoiceNumber: string;
  contractor: string;
  grossAmount: string;
  issueDate: string;
  score: number;
};

export function scoreCostMatch(
  tx: { amount: number; bookingDate: Date; description: string },
  inv: Pick<CostInvoice, "grossAmount" | "documentDate" | "documentNumber" | "supplier" | "description">,
): number {
  const ag = Math.abs(tx.amount);
  const ig = grossToGrosze(inv.grossAmount);
  let score = 0;
  if (Math.abs(ag - ig) <= GROSZ_EPS) score += 6;
  else if (Math.abs(ag - ig) <= 100) score += 2;
  const dd = daysApart(tx.bookingDate, inv.documentDate);
  score += dateScore(dd);
  score += tokenOverlap(tx.description, `${inv.supplier} ${inv.description} ${inv.documentNumber}`);
  score += docHintScore(extractDocHints(tx.description), inv.documentNumber);
  return score;
}

export function scoreIncomeMatch(
  tx: { amount: number; bookingDate: Date; description: string },
  inv: Pick<IncomeInvoice, "grossAmount" | "issueDate" | "invoiceNumber" | "contractor" | "description">,
): number {
  const ag = Math.abs(tx.amount);
  const ig = grossToGrosze(inv.grossAmount);
  let score = 0;
  if (Math.abs(ag - ig) <= GROSZ_EPS) score += 6;
  else if (Math.abs(ag - ig) <= 100) score += 2;
  const dd = daysApart(tx.bookingDate, inv.issueDate);
  score += dateScore(dd);
  score += tokenOverlap(tx.description, `${inv.contractor} ${inv.description} ${inv.invoiceNumber}`);
  score += docHintScore(extractDocHints(tx.description), inv.invoiceNumber);
  return score;
}

/** Dla transakcji dodatniej obniżamy ranking kosztów (nadwyżka przychodu); przy ujemnej — odwrotnie. */
const DEMOTE_FACTOR = 0.12;

export function rankCosts(
  tx: { amount: number; bookingDate: Date; description: string },
  list: (CostInvoice & { score?: number })[],
  take = 15,
  opts?: { demote?: boolean },
): CostSuggestion[] {
  const mul = opts?.demote ? DEMOTE_FACTOR : 1;
  const scored = list
    .map((inv) => ({
      id: inv.id,
      documentNumber: inv.documentNumber,
      supplier: inv.supplier,
      grossAmount: inv.grossAmount.toString(),
      documentDate: inv.documentDate.toISOString(),
      score: Math.round(scoreCostMatch(tx, inv) * mul * 100) / 100,
    }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, take);
}

export function rankIncomes(
  tx: { amount: number; bookingDate: Date; description: string },
  list: IncomeInvoice[],
  take = 15,
  opts?: { demote?: boolean },
): IncomeSuggestion[] {
  const mul = opts?.demote ? DEMOTE_FACTOR : 1;
  const scored = list
    .map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      contractor: inv.contractor,
      grossAmount: inv.grossAmount.toString(),
      issueDate: inv.issueDate.toISOString(),
      score: Math.round(scoreIncomeMatch(tx, inv) * mul * 100) / 100,
    }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, take);
}
