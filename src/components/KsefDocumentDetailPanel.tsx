"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Badge, Button } from "@/components/ui";
import {
  costInvoiceListEditHref,
  incomeInvoiceListEditHref,
} from "@/lib/navigation/invoice-deep-links";
import type { KsefInvoicePreview } from "@/lib/ksef/invoice-preview";
import type { KsefDocumentDirection, KsefWorkflowStatus } from "@/lib/ksef/types";

type DuplicateCost = {
  id: string;
  documentNumber: string;
  supplier: string;
  grossAmount: string;
} | null;

type DuplicateIncome = {
  id: string;
  invoiceNumber: string;
  contractor: string;
  grossAmount: string;
} | null;

type DocAction =
  | "import-cost"
  | "import-revenue"
  | "mark-duplicate"
  | "reject"
  | "restore"
  | "undo-import";

export type KsefDocumentDetailPanelProps = {
  workflowStatus: KsefWorkflowStatus;
  importedAsCostInvoiceId: string | null;
  importedAsRevenueInvoiceId: string | null;
  duplicateMatchSummary: string | null;
  preview: KsefInvoicePreview;
  rawPayload: unknown;
  duplicateCost: DuplicateCost;
  duplicateIncome: DuplicateIncome;
  acting: boolean;
  canImportCost: boolean;
  canImportRevenue: boolean;
  canUndoImport: boolean;
  importBlockedReason: string | null;
  onAction: (action: DocAction) => void;
};

function workflowBadge(status: KsefWorkflowStatus) {
  if (status === "NEW") return <Badge variant="default">Nowy</Badge>;
  if (status === "PROBABLE_DUPLICATE") return <Badge variant="warning">Już w systemie</Badge>;
  if (status === "IMPORTED") return <Badge variant="success">Zaimportowany</Badge>;
  return <Badge variant="muted">Odrzucony</Badge>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {children}
    </h3>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-x-2 gap-y-0.5 text-xs">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-zinc-900 dark:text-zinc-100">{value}</dd>
    </div>
  );
}

function PartyBlock({ title, party }: { title: string; party: KsefInvoicePreview["seller"] }) {
  return (
    <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <SectionTitle>{title}</SectionTitle>
      <p className="font-medium text-zinc-900 dark:text-zinc-50">{party.name}</p>
      <dl className="space-y-1">
        {party.taxId ? <InfoRow label="NIP" value={<span className="font-mono">{party.taxId}</span>} /> : null}
        {party.address ? <InfoRow label="Adres" value={party.address} /> : null}
        {party.bankAccount ? (
          <InfoRow
            label="Rachunek"
            value={<span className="font-mono break-all">{party.bankAccount}</span>}
          />
        ) : null}
      </dl>
    </section>
  );
}

function AmountTable({ preview }: { preview: KsefInvoicePreview }) {
  return (
    <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-700">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-700 dark:bg-zinc-900/60">
            <th className="px-2 py-1.5 font-medium text-zinc-600">Pozycja</th>
            <th className="px-2 py-1.5 text-right font-medium text-zinc-600">Kwota</th>
            <th className="px-2 py-1.5 font-medium text-zinc-600">Waluta</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          <tr className="border-b border-zinc-100 dark:border-zinc-800">
            <td className="px-2 py-1.5">Netto</td>
            <td className="px-2 py-1.5 text-right">{preview.netAmount}</td>
            <td className="px-2 py-1.5">{preview.currency}</td>
          </tr>
          <tr className="border-b border-zinc-100 dark:border-zinc-800">
            <td className="px-2 py-1.5">VAT</td>
            <td className="px-2 py-1.5 text-right">{preview.vatAmount}</td>
            <td className="px-2 py-1.5">{preview.currency}</td>
          </tr>
          <tr>
            <td className="px-2 py-1.5 font-semibold">Brutto</td>
            <td className="px-2 py-1.5 text-right font-semibold">{preview.grossAmount}</td>
            <td className="px-2 py-1.5 font-semibold">{preview.currency}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function VatBreakdownTable({ preview }: { preview: KsefInvoicePreview }) {
  if (preview.vatBreakdown.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded border border-zinc-200 dark:border-zinc-700">
      <table className="w-full min-w-[280px] border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-700 dark:bg-zinc-900/60">
            <th className="px-2 py-1 font-medium text-zinc-600">Stawka VAT</th>
            <th className="px-2 py-1 text-right font-medium text-zinc-600">Netto</th>
            <th className="px-2 py-1 text-right font-medium text-zinc-600">VAT</th>
            <th className="px-2 py-1 text-right font-medium text-zinc-600">Brutto</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {preview.vatBreakdown.map((line, i) => (
            <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
              <td className="px-2 py-1">{line.rate ? `${line.rate}%` : line.label}</td>
              <td className="px-2 py-1 text-right">{line.netAmount ?? "—"}</td>
              <td className="px-2 py-1 text-right">{line.vatAmount ?? "—"}</td>
              <td className="px-2 py-1 text-right">{line.grossAmount ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinesTable({ lines }: { lines: KsefInvoicePreview["lines"] }) {
  return (
    <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-700">
      <table className="w-full min-w-[520px] border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-700 dark:bg-zinc-900/60">
            <th className="px-1.5 py-1 font-medium text-zinc-600">Lp.</th>
            <th className="px-1.5 py-1 font-medium text-zinc-600">Nazwa</th>
            <th className="px-1.5 py-1 text-right font-medium text-zinc-600">Ilość</th>
            <th className="px-1.5 py-1 font-medium text-zinc-600">Jm.</th>
            <th className="px-1.5 py-1 text-right font-medium text-zinc-600">Cena netto</th>
            <th className="px-1.5 py-1 font-medium text-zinc-600">VAT</th>
            <th className="px-1.5 py-1 text-right font-medium text-zinc-600">Netto</th>
            <th className="px-1.5 py-1 text-right font-medium text-zinc-600">VAT</th>
            <th className="px-1.5 py-1 text-right font-medium text-zinc-600">Brutto</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800">
              <td className="px-1.5 py-1 font-mono">{line.lineNumber ?? i + 1}</td>
              <td className="max-w-[140px] px-1.5 py-1">{line.name}</td>
              <td className="px-1.5 py-1 text-right font-mono">{line.quantity ?? "—"}</td>
              <td className="px-1.5 py-1">{line.unit ?? "—"}</td>
              <td className="px-1.5 py-1 text-right font-mono">{line.unitNetPrice ?? "—"}</td>
              <td className="px-1.5 py-1 font-mono">{line.vatRate ?? "—"}</td>
              <td className="px-1.5 py-1 text-right font-mono">{line.netAmount ?? "—"}</td>
              <td className="px-1.5 py-1 text-right font-mono">{line.vatAmount ?? "—"}</td>
              <td className="px-1.5 py-1 text-right font-mono">{line.grossAmount ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KsefDocumentDetailPanel({
  workflowStatus,
  importedAsCostInvoiceId,
  importedAsRevenueInvoiceId,
  duplicateMatchSummary,
  preview,
  rawPayload,
  duplicateCost,
  duplicateIncome,
  acting,
  canImportCost,
  canImportRevenue,
  canUndoImport,
  importBlockedReason,
  onAction,
}: KsefDocumentDetailPanelProps) {
  const [showTechnical, setShowTechnical] = useState(false);

  const duplicateCostId = duplicateCost?.id ?? null;
  const duplicateIncomeId = duplicateIncome?.id ?? null;
  const ws = workflowStatus;

  return (
    <div className="space-y-4 text-sm">
      <section className="space-y-2">
        <SectionTitle>Nagłówek faktury</SectionTitle>
        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{preview.invoiceNumber}</p>
        <p className="break-all font-mono text-[11px] text-zinc-500">{preview.ksefId}</p>
        <div className="flex flex-wrap items-center gap-2">
          {workflowBadge(workflowStatus)}
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            {preview.directionLabel}
            {preview.documentType && preview.documentType !== "UNKNOWN"
              ? ` · ${preview.documentType}`
              : ""}
          </span>
        </div>
        <dl className="space-y-1 rounded border border-zinc-100 bg-zinc-50/80 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
          <InfoRow label="Data wystawienia" value={preview.issueDate ?? "—"} />
          <InfoRow label="Data sprzedaży" value={preview.saleDate ?? "—"} />
          <InfoRow label="Wpływ do KSeF" value={preview.ksefReceivedDate ?? "—"} />
          <InfoRow label="Termin płatności" value={preview.paymentDueDate ?? "—"} />
          <InfoRow label="Waluta" value={preview.currency} />
        </dl>
      </section>

      <PartyBlock title="Sprzedawca" party={preview.seller} />
      <PartyBlock title="Nabywca" party={preview.buyer} />

      <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
        <SectionTitle>Kwoty</SectionTitle>
        <AmountTable preview={preview} />
        <VatBreakdownTable preview={preview} />
      </section>

      <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
        <SectionTitle>Pozycje faktury</SectionTitle>
        {preview.lines.length > 0 ? (
          <LinesTable lines={preview.lines} />
        ) : (
          <p className="rounded border border-dashed border-zinc-200 bg-zinc-50/60 px-2 py-2 text-xs leading-relaxed text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400">
            Pozycje faktury nie są dostępne w metadanych KSeF. Będą dostępne po pobraniu pełnej
            faktury XML.
          </p>
        )}
      </section>

      <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
        <SectionTitle>Powiązania</SectionTitle>
        {workflowStatus === "IMPORTED" && importedAsCostInvoiceId ? (
          <p>
            <Link
              href={costInvoiceListEditHref(importedAsCostInvoiceId)}
              className="text-blue-600 underline dark:text-blue-400"
            >
              Otwórz zaimportowaną fakturę kosztową
            </Link>
          </p>
        ) : null}
        {workflowStatus === "IMPORTED" && importedAsRevenueInvoiceId ? (
          <p>
            <Link
              href={incomeInvoiceListEditHref(importedAsRevenueInvoiceId)}
              className="text-blue-600 underline dark:text-blue-400"
            >
              Otwórz zaimportowaną fakturę przychodową
            </Link>
          </p>
        ) : null}
        {duplicateCostId ? (
          <p>
            <Link
              href={costInvoiceListEditHref(duplicateCostId)}
              className="text-amber-800 underline dark:text-amber-300"
            >
              Już w systemie — faktura kosztowa
            </Link>
            {duplicateCost ? (
              <span className="mt-0.5 block text-xs text-zinc-500">
                {duplicateCost.documentNumber} · {duplicateCost.supplier}
              </span>
            ) : null}
          </p>
        ) : null}
        {duplicateIncomeId ? (
          <p>
            <Link
              href={incomeInvoiceListEditHref(duplicateIncomeId)}
              className="text-amber-800 underline dark:text-amber-300"
            >
              Już w systemie — faktura przychodowa
            </Link>
            {duplicateIncome ? (
              <span className="mt-0.5 block text-xs text-zinc-500">
                {duplicateIncome.invoiceNumber} · {duplicateIncome.contractor}
              </span>
            ) : null}
          </p>
        ) : null}
        {duplicateMatchSummary ? (
          <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {duplicateMatchSummary}
          </div>
        ) : null}
        {!duplicateCostId &&
        !duplicateIncomeId &&
        !importedAsCostInvoiceId &&
        !importedAsRevenueInvoiceId ? (
          <p className="text-xs text-zinc-500">Brak powiązań z fakturami w systemie.</p>
        ) : null}
        {canUndoImport ? (
          <Button
            type="button"
            variant="secondary"
            className="mt-1 w-full"
            disabled={acting}
            onClick={() => onAction("undo-import")}
          >
            Cofnij import
          </Button>
        ) : null}
      </section>

      <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
        {canImportCost ? (
          <Button type="button" disabled={acting} onClick={() => onAction("import-cost")}>
            Importuj jako koszt
          </Button>
        ) : null}
        {importBlockedReason ? (
          <p className="text-xs text-zinc-500">{importBlockedReason}</p>
        ) : null}
        {canImportRevenue ? (
          <Button type="button" disabled={acting} onClick={() => onAction("import-revenue")}>
            Importuj jako przychód
          </Button>
        ) : null}
        {ws === "PROBABLE_DUPLICATE" ? (
          <Button type="button" variant="secondary" disabled>
            Już w systemie — import zablokowany
          </Button>
        ) : null}
        {ws !== "IMPORTED" && ws !== "REJECTED" ? (
          <Button
            type="button"
            variant="secondary"
            disabled={acting}
            onClick={() => onAction("mark-duplicate")}
          >
            Już mam w systemie
          </Button>
        ) : null}
        {ws !== "IMPORTED" && ws !== "REJECTED" ? (
          <Button type="button" variant="secondary" disabled={acting} onClick={() => onAction("reject")}>
            Odrzuć
          </Button>
        ) : null}
        {ws === "REJECTED" || ws === "PROBABLE_DUPLICATE" ? (
          <Button type="button" variant="secondary" disabled={acting} onClick={() => onAction("restore")}>
            Przywróć do nowych
          </Button>
        ) : null}
      </div>

      {rawPayload != null ? (
        <section className="border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <button
            type="button"
            className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
            onClick={() => setShowTechnical((v) => !v)}
            aria-expanded={showTechnical}
          >
            {showTechnical ? "Ukryj dane techniczne" : "Pokaż dane techniczne"}
          </button>
          {showTechnical ? (
            <pre className="mt-2 max-h-48 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 text-[10px] leading-snug text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {JSON.stringify(rawPayload, null, 2)}
            </pre>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
