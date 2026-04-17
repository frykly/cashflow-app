import type {
  CostInvoice,
  CostInvoicePayment,
  IncomeInvoice,
  IncomeInvoicePayment,
  PlannedFinancialEvent,
} from "@prisma/client";
import { decToNumber } from "@/lib/cashflow/money";
import { costRemainingGross, incomeRemainingGross, PAY_EPS } from "@/lib/cashflow/settlement";
import { documentGrossSlicesFromInvoice } from "@/lib/payment-project-allocation/distribute-read";

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
  /** Brutto pozostałe do zapłaty (dokument − wpłaty). */
  remainingGross: string;
  /** Czy da się przypisać całą kwotę transakcji bankowej (ujemnej) jako jedną płatność. */
  canFitFullPayment: boolean;
};

export type IncomeSuggestion = {
  id: string;
  invoiceNumber: string;
  contractor: string;
  grossAmount: string;
  issueDate: string;
  score: number;
  vatDestination: string;
  netAmount: string;
  vatAmount: string;
  /** true = wiele projektów — jawny podział MAIN/VAT na wpłacie jest zablokowany */
  splitBlocked: boolean;
  /** Brutto pozostałe do wpłaty (faktura − wpłaty). */
  remainingGross: string;
  /** Czy da się przypisać całą kwotę transakcji bankowej (dodatniej) jako jedną wpłatę. */
  canFitFullPayment: boolean;
};

export type PlannedExpenseSuggestion = {
  id: string;
  title: string;
  plannedDate: string;
  /** Suma główna + VAT (PLN) jako string */
  totalGross: string;
  score: number;
  projectLabel: string;
  categoryName: string | null;
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

function plannedExpenseTotalGrosze(ev: Pick<PlannedFinancialEvent, "amount" | "amountVat">): number {
  const main = decToNumber(ev.amount as never);
  const vat = decToNumber(ev.amountVat as never);
  return Math.round((main + vat) * 100);
}

export function scorePlannedExpenseMatch(
  tx: { amount: number; bookingDate: Date; description: string },
  ev: Pick<PlannedFinancialEvent, "amount" | "amountVat" | "plannedDate" | "title" | "description">,
): number {
  const ag = Math.abs(tx.amount);
  const eg = plannedExpenseTotalGrosze(ev);
  let score = 0;
  if (Math.abs(ag - eg) <= GROSZ_EPS) score += 6;
  else if (Math.abs(ag - eg) <= 100) score += 2;
  const dd = daysApart(tx.bookingDate, ev.plannedDate);
  score += dateScore(dd);
  score += tokenOverlap(tx.description, `${ev.title} ${ev.description}`);
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
  list: (CostInvoice & {
    score?: number;
    payments?: Pick<CostInvoicePayment, "amountGross">[];
  })[],
  take = 15,
  opts?: { demote?: boolean },
): CostSuggestion[] {
  const mul = opts?.demote ? DEMOTE_FACTOR : 1;
  const payPln = Math.abs(tx.amount) / 100;
  const scored = list
    .map((inv) => {
      const rem = costRemainingGross(inv, inv.payments ?? []);
      return {
        id: inv.id,
        documentNumber: inv.documentNumber,
        supplier: inv.supplier,
        grossAmount: inv.grossAmount.toString(),
        documentDate: inv.documentDate.toISOString(),
        score: Math.round(scoreCostMatch(tx, inv) * mul * 100) / 100,
        remainingGross: rem.toFixed(2),
        canFitFullPayment: rem + PAY_EPS >= payPln,
      };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, take);
}

export function rankPlannedExpenses(
  tx: { amount: number; bookingDate: Date; description: string },
  list: (PlannedFinancialEvent & {
    project?: { name: string; code: string | null } | null;
    expenseCategory?: { name: string } | null;
  })[],
  take = 200,
  opts?: { demote?: boolean },
): PlannedExpenseSuggestion[] {
  const mul = opts?.demote ? DEMOTE_FACTOR : 1;
  const scored = list
    .map((ev) => {
      const tg = (decToNumber(ev.amount as never) + decToNumber(ev.amountVat as never)).toFixed(2);
      const pl = ev.project
        ? `${ev.project.code ? `${ev.project.code} · ` : ""}${ev.project.name}`
        : "(brak projektu)";
      return {
        id: ev.id,
        title: ev.title,
        plannedDate: ev.plannedDate.toISOString(),
        totalGross: tg,
        score: Math.round(scorePlannedExpenseMatch(tx, ev) * mul * 100) / 100,
        projectLabel: pl,
        categoryName: ev.expenseCategory?.name ?? null,
      };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, take);
}

export function rankIncomes(
  tx: { amount: number; bookingDate: Date; description: string },
  list: (IncomeInvoice & {
    projectAllocations?: { projectId: string; grossAmount: unknown }[];
    payments?: Pick<IncomeInvoicePayment, "amountGross">[];
  })[],
  take = 15,
  opts?: { demote?: boolean },
): IncomeSuggestion[] {
  const mul = opts?.demote ? DEMOTE_FACTOR : 1;
  const payPln = Math.abs(tx.amount) / 100;
  const scored = list
    .map((inv) => {
      const rem = incomeRemainingGross(inv, inv.payments ?? []);
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        contractor: inv.contractor,
        grossAmount: inv.grossAmount.toString(),
        issueDate: inv.issueDate.toISOString(),
        score: Math.round(scoreIncomeMatch(tx, inv) * mul * 100) / 100,
        vatDestination: inv.vatDestination,
        netAmount: inv.netAmount.toString(),
        vatAmount: inv.vatAmount.toString(),
        splitBlocked: documentGrossSlicesFromInvoice({
          projectAllocations: inv.projectAllocations ?? [],
          grossAmount: inv.grossAmount,
          projectId: inv.projectId,
        }).length > 1,
        remainingGross: rem.toFixed(2),
        canFitFullPayment: rem + PAY_EPS >= payPln,
      };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, take);
}
