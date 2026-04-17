"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { readApiError } from "@/lib/api-client";
import { formatPlnFromGrosze } from "@/lib/bank-import/format-pln";
import { decToNumber } from "@/lib/cashflow/money";
import { formatMoney, safeFormatDate } from "@/lib/format";
import { Alert, Button, Spinner } from "@/components/ui";
import { CreateCostFromBankModal } from "@/components/CreateCostFromBankModal";

type DedupePayload = {
  fingerprintNew: string;
  fingerprintLegacy: string;
  matchesStored: string;
  hint: string;
};

type DetailJson = {
  id: string;
  importId: string;
  bookingDate: string;
  valueDate: string | null;
  amount: number;
  currency: string;
  description: string;
  counterpartyName: string | null;
  counterpartyAccount: string | null;
  accountType: string;
  status: string;
  dedupeKey: string | null;
  dedupe: DedupePayload;
  import: { id: string; fileName: string; createdAt: string };
  links: {
    payment: {
      id: string;
      amountGross: unknown;
      costInvoiceId: string;
      costInvoice: { id: string; documentNumber: string; supplier: string };
    } | null;
    linkedCost: { id: string; documentNumber: string; supplier: string } | null;
    matchedIncome: { id: string; invoiceNumber: string; contractor: string } | null;
    createdCost: { id: string; documentNumber: string; supplier: string } | null;
    otherIncome: { id: string; description: string; amountGross: unknown; vatAmount: unknown } | null;
  };
};

type Props = {
  importId: string;
  transactionId: string;
};

function canCreateCost(status: string, hasLink: boolean): boolean {
  if (hasLink) return false;
  if (["VAT_TOPUP", "DUPLICATE", "IGNORED"].includes(status)) return false;
  return true;
}

export function BankTransactionDetailClient({ importId, transactionId }: Props) {
  const [data, setData] = useState<DetailJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [costOpen, setCostOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/bank-transactions/${transactionId}`);
    if (!res.ok) {
      setError(await readApiError(res));
      setData(null);
      return;
    }
    const j = (await res.json()) as DetailJson;
    if (j.importId !== importId) {
      setError("Transakcja nie należy do tego importu.");
      setData(null);
      return;
    }
    setData(j);
  }, [importId, transactionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data && !error) {
    return (
      <div className="flex items-center gap-2 text-zinc-500">
        <Spinner className="!size-5" />
        Ładowanie…
      </div>
    );
  }
  if (error && !data) {
    return <Alert variant="error">{error}</Alert>;
  }
  if (!data) return null;

  const { links: L } = data;
  const hasCostLink = Boolean(
    L.createdCost?.id || L.linkedCost?.id || L.payment?.costInvoiceId || L.otherIncome?.id,
  );

  return (
    <div className="space-y-6">
      <CreateCostFromBankModal
        transactionId={costOpen ? transactionId : null}
        open={costOpen}
        onClose={() => setCostOpen(false)}
        onCreated={() => void load()}
      />

      <div className="flex flex-wrap items-baseline gap-4">
        <Link href={`/bank-imports/${importId}`} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← Transakcje importu
        </Link>
        <Link href="/bank-imports" className="text-sm text-zinc-500 hover:underline">
          Wszystkie importy
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Transakcja bankowa</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Import: {data.import.fileName} · {safeFormatDate(data.import.createdAt)}
        </p>
      </div>

      <div className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium uppercase text-zinc-500">Data księgowania</div>
            <div>{safeFormatDate(data.bookingDate)}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase text-zinc-500">Data waluty</div>
            <div>{data.valueDate ? safeFormatDate(data.valueDate) : "—"}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase text-zinc-500">Kwota</div>
            <div className="tabular-nums">
              {formatPlnFromGrosze(data.amount)} {data.currency !== "PLN" ? data.currency : ""}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase text-zinc-500">Konto (import)</div>
            <div>{data.accountType}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase text-zinc-500">Status</div>
            <div className="font-medium">{data.status}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase text-zinc-500">Dedupe w bazie</div>
            <div className="break-all font-mono text-xs">{data.dedupeKey ?? "— (legacy)"}</div>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium uppercase text-zinc-500">Kontrahent (z wyciągu)</div>
          <div>{data.counterpartyName ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase text-zinc-500">Rachunek kontrahenta</div>
          <div className="break-all font-mono text-xs">{data.counterpartyAccount ?? "—"}</div>
        </div>

        <div>
          <div className="text-xs font-medium uppercase text-zinc-500">Pełny opis / tytuł</div>
          <div className="whitespace-pre-wrap break-words rounded border border-zinc-100 bg-zinc-50 p-2 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            {data.description || "—"}
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="text-xs font-semibold uppercase tracking-wide">Deduplikacja (import)</div>
          <p className="mt-1 text-sm">{data.dedupe.hint}</p>
          <p className="mt-2 font-mono text-[11px] leading-relaxed break-all opacity-90">
            Nowy fingerprint: {data.dedupe.fingerprintNew}
            <br />
            Legacy: {data.dedupe.fingerprintLegacy}
            <br />
            Zgodność z zapisem: {data.dedupe.matchesStored}
          </p>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase text-zinc-500">Powiązania</div>
          <ul className="space-y-2">
            {L.createdCost ? (
              <li>
                Koszt utworzony z importu:{" "}
                <Link href="/cost-invoices" className="font-medium text-blue-600 underline dark:text-blue-400">
                  {L.createdCost.documentNumber} — {L.createdCost.supplier}
                </Link>
              </li>
            ) : null}
            {L.linkedCost ? (
              <li>
                Powiązany koszt:{" "}
                <Link href="/cost-invoices" className="font-medium text-blue-600 underline dark:text-blue-400">
                  {L.linkedCost.documentNumber} — {L.linkedCost.supplier}
                </Link>
              </li>
            ) : null}
            {L.payment ? (
              <li>
                Płatność: {formatMoney(L.payment.amountGross)} →{" "}
                <Link href="/cost-invoices" className="text-blue-600 underline dark:text-blue-400">
                  {L.payment.costInvoice.documentNumber}
                </Link>
              </li>
            ) : null}
            {L.matchedIncome ? (
              <li>
                Dopasowany przychód:{" "}
                <Link href="/income-invoices" className="font-medium text-blue-600 underline dark:text-blue-400">
                  {L.matchedIncome.invoiceNumber} — {L.matchedIncome.contractor}
                </Link>
              </li>
            ) : null}
            {L.otherIncome ? (
              <li>
                Przychód bez faktury: brutto {formatMoney(L.otherIncome.amountGross)}
                {decToNumber(L.otherIncome.vatAmount as string | number) > 0 ?
                  <>
                    {" "}
                    · VAT {formatMoney(L.otherIncome.vatAmount)} · MAIN{" "}
                    {formatMoney(
                      decToNumber(L.otherIncome.amountGross as string | number) -
                        decToNumber(L.otherIncome.vatAmount as string | number),
                    )}
                  </>
                : null}{" "}
                — {L.otherIncome.description}
              </li>
            ) : null}
            {!L.createdCost && !L.linkedCost && !L.payment && !L.matchedIncome && !L.otherIncome ? (
              <li className="text-zinc-500">Brak powiązań z dokumentami.</li>
            ) : null}
          </ul>
        </div>
      </div>

      {canCreateCost(data.status, hasCostLink) ? (
        <Button type="button" onClick={() => setCostOpen(true)}>
          Utwórz nowy koszt
        </Button>
      ) : null}
    </div>
  );
}
