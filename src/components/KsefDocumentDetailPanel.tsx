"use client";

import { useState, type ReactNode } from "react";
import { Badge, Button } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import type { KsefInvoicePreview } from "@/lib/ksef/invoice-preview";
import type { KsefWorkflowStatus } from "@/lib/ksef/types";
import type { KsefImportCostBody, KsefImportRevenueBody } from "@/lib/validation/ksef-import-schemas";
import { KsefImportForm } from "@/components/KsefImportForm";

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
  | "undo-import"
  | "fetch-xml";

export type KsefDocumentDetailPanelProps = {
  source: string;
  workflowStatus: KsefWorkflowStatus;
  importedAsCostInvoiceId: string | null;
  importedAsRevenueInvoiceId: string | null;
  duplicateMatchSummary: string | null;
  preview: KsefInvoicePreview;
  rawPayload: unknown;
  xmlPayload: string | null;
  xmlFetchStatus: string | null;
  xmlFetchedAt: string | null;
  xmlFetchError: string | null;
  xmlFetching: boolean;
  canRefreshXml: boolean;
  duplicateCost: DuplicateCost;
  duplicateIncome: DuplicateIncome;
  acting: boolean;
  canImportCost: boolean;
  canImportRevenue: boolean;
  canUndoImport: boolean;
  importBlockedReason: string | null;
  onAction: (action: DocAction, opts?: { forceXml?: boolean }) => void;
  hideActions?: boolean;
  focusImportSection?: boolean;
  onImportFocusHandled?: () => void;
  onImportCostSubmit?: (body: KsefImportCostBody) => void;
  onImportRevenueSubmit?: (body: KsefImportRevenueBody) => void;
  onOpenLinkedInvoice?: (kind: "cost" | "income", invoiceId: string) => void;
};

export type KsefDocumentDetailActionsProps = Pick<
  KsefDocumentDetailPanelProps,
  | "workflowStatus"
  | "importedAsCostInvoiceId"
  | "importedAsRevenueInvoiceId"
  | "acting"
  | "canUndoImport"
  | "importBlockedReason"
  | "onAction"
> & {
  duplicateCostId: string | null;
  duplicateIncomeId: string | null;
  compact?: boolean;
  onOpenLinkedInvoice?: (kind: "cost" | "income", invoiceId: string) => void;
};

export function KsefDocumentDetailActions({
  workflowStatus: ws,
  importedAsCostInvoiceId,
  importedAsRevenueInvoiceId,
  duplicateCostId,
  duplicateIncomeId,
  acting,
  canUndoImport,
  importBlockedReason,
  onAction,
  compact = false,
  onOpenLinkedInvoice,
}: KsefDocumentDetailActionsProps) {
  const btnClass = compact ? "text-xs px-2 py-1" : "";
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "flex-col"}`}>
      {importBlockedReason ? (
        <p className="text-xs text-zinc-500">{importBlockedReason}</p>
      ) : null}
      {ws === "PROBABLE_DUPLICATE" ? (
        <Button type="button" variant="secondary" disabled className={btnClass}>
          Już w systemie — import zablokowany
        </Button>
      ) : null}
      {ws !== "IMPORTED" && ws !== "REJECTED" ? (
        <Button
          type="button"
          variant="secondary"
          disabled={acting}
          className={btnClass}
          onClick={() => onAction("mark-duplicate")}
        >
          Już mam w systemie
        </Button>
      ) : null}
      {ws !== "IMPORTED" && ws !== "REJECTED" ? (
        <Button
          type="button"
          variant="secondary"
          disabled={acting}
          className={btnClass}
          onClick={() => onAction("reject")}
        >
          Odrzuć
        </Button>
      ) : null}
      {ws === "IMPORTED" && importedAsCostInvoiceId ? (
        <Button
          type="button"
          variant="secondary"
          className={btnClass}
          onClick={() => onOpenLinkedInvoice?.("cost", importedAsCostInvoiceId)}
        >
          Otwórz fakturę
        </Button>
      ) : null}
      {ws === "IMPORTED" && importedAsRevenueInvoiceId ? (
        <Button
          type="button"
          variant="secondary"
          className={btnClass}
          onClick={() => onOpenLinkedInvoice?.("income", importedAsRevenueInvoiceId)}
        >
          Otwórz fakturę
        </Button>
      ) : null}
      {duplicateCostId ? (
        <Button
          type="button"
          variant="secondary"
          className={btnClass}
          onClick={() => onOpenLinkedInvoice?.("cost", duplicateCostId)}
        >
          Otwórz powiązaną
        </Button>
      ) : null}
      {duplicateIncomeId ? (
        <Button
          type="button"
          variant="secondary"
          className={btnClass}
          onClick={() => onOpenLinkedInvoice?.("income", duplicateIncomeId)}
        >
          Otwórz powiązaną
        </Button>
      ) : null}
      {canUndoImport ? (
        <Button
          type="button"
          variant="secondary"
          disabled={acting}
          className={btnClass}
          onClick={() => onAction("undo-import")}
        >
          Cofnij import
        </Button>
      ) : null}
      {ws === "REJECTED" || ws === "PROBABLE_DUPLICATE" ? (
        <Button
          type="button"
          variant="secondary"
          disabled={acting}
          className={btnClass}
          onClick={() => onAction("restore")}
        >
          Przywróć do nowych
        </Button>
      ) : null}
    </div>
  );
}

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
  const hasSettlement =
    preview.settlementCharges.length > 0 ||
    preview.settlementDeductions.length > 0 ||
    preview.additionalChargesTotal != null ||
    preview.deductionsTotal != null;
  const grossLabel = hasSettlement ? "Kwota faktury (brutto)" : "Brutto";

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
            <td className="px-2 py-1.5 font-semibold">{grossLabel}</td>
            <td className="px-2 py-1.5 text-right font-semibold">{preview.invoiceGrossAmount}</td>
            <td className="px-2 py-1.5 font-semibold">{preview.currency}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SettlementSection({ preview }: { preview: KsefInvoicePreview }) {
  const hasCharges = preview.settlementCharges.length > 0 || preview.additionalChargesTotal != null;
  const hasDeductions = preview.settlementDeductions.length > 0 || preview.deductionsTotal != null;
  if (!hasCharges && !hasDeductions && !preview.amountToPay) return null;

  return (
    <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <SectionTitle>Rozliczenie / obciążenia</SectionTitle>
      {hasCharges ? (
        <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-700">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-700 dark:bg-zinc-900/60">
                <th className="px-2 py-1.5 font-medium text-zinc-600">Obciążenie</th>
                <th className="px-2 py-1.5 text-right font-medium text-zinc-600">Kwota</th>
              </tr>
            </thead>
            <tbody>
              {preview.settlementCharges.map((line, i) => (
                <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-2 py-1.5">{line.description}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{line.amount}</td>
                </tr>
              ))}
              {preview.additionalChargesTotal ? (
                <tr className="bg-amber-50/80 font-semibold dark:bg-amber-950/30">
                  <td className="px-2 py-1.5">Suma obciążeń</td>
                  <td className="px-2 py-1.5 text-right font-mono">{preview.additionalChargesTotal}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {hasDeductions ? (
        <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-700">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-700 dark:bg-zinc-900/60">
                <th className="px-2 py-1.5 font-medium text-zinc-600">Odliczenie</th>
                <th className="px-2 py-1.5 text-right font-medium text-zinc-600">Kwota</th>
              </tr>
            </thead>
            <tbody>
              {preview.settlementDeductions.map((line, i) => (
                <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-2 py-1.5">{line.description}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{line.amount}</td>
                </tr>
              ))}
              {preview.deductionsTotal ? (
                <tr className="bg-emerald-50/80 font-semibold dark:bg-emerald-950/30">
                  <td className="px-2 py-1.5">Suma odliczeń</td>
                  <td className="px-2 py-1.5 text-right font-mono">{preview.deductionsTotal}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {preview.amountToPay ? (
        <div className="rounded-lg border-2 border-sky-300 bg-sky-50 px-3 py-3 dark:border-sky-800 dark:bg-sky-950/50">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-800 dark:text-sky-200">
            Razem do zapłaty
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-sky-950 dark:text-sky-50">
            {formatMoney(preview.amountToPay)}
          </p>
          <p className="mt-1 text-xs text-sky-900/80 dark:text-sky-200/80">
            Kwota faktury: {formatMoney(preview.invoiceGrossAmount)}
            {preview.additionalChargesTotal
              ? ` · Obciążenia: ${formatMoney(preview.additionalChargesTotal)}`
              : ""}
            {preview.deductionsTotal ? ` · Odliczenia: ${formatMoney(preview.deductionsTotal)}` : ""}
          </p>
        </div>
      ) : null}
      {preview.amountToSettle ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Do rozliczenia (nadpłata): {formatMoney(preview.amountToSettle)}
        </p>
      ) : null}
    </section>
  );
}

function PaymentSection({ preview }: { preview: KsefInvoicePreview }) {
  if (!preview.paymentDueDate && !preview.seller.bankAccount) return null;
  return (
    <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <SectionTitle>Płatność</SectionTitle>
      <dl className="space-y-1 rounded border border-zinc-100 bg-zinc-50/80 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
        <InfoRow label="Termin płatności" value={preview.paymentDueDate ? formatDate(preview.paymentDueDate) : "—"} />
        <InfoRow
          label="Rachunek bankowy"
          value={
            preview.seller.bankAccount ? (
              <span className="font-mono break-all">{preview.seller.bankAccount}</span>
            ) : (
              "—"
            )
          }
        />
      </dl>
    </section>
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
  source,
  workflowStatus,
  importedAsCostInvoiceId,
  importedAsRevenueInvoiceId,
  duplicateMatchSummary,
  preview,
  rawPayload,
  xmlPayload,
  xmlFetchStatus,
  xmlFetchedAt,
  xmlFetchError,
  xmlFetching,
  canRefreshXml,
  duplicateCost,
  duplicateIncome,
  acting,
  canImportCost,
  canImportRevenue,
  canUndoImport,
  importBlockedReason,
  onAction,
  hideActions = false,
  focusImportSection = false,
  onImportFocusHandled,
  onImportCostSubmit,
  onImportRevenueSubmit,
  onOpenLinkedInvoice,
}: KsefDocumentDetailPanelProps) {
  const [showTechnical, setShowTechnical] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);

  const duplicateCostId = duplicateCost?.id ?? null;
  const duplicateIncomeId = duplicateIncome?.id ?? null;

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
          {preview.previewSource === "xml" ? (
            <Badge variant="success">Pełna faktura XML</Badge>
          ) : xmlFetching ? (
            <Badge variant="default">Pobieranie XML…</Badge>
          ) : null}
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
        <SectionTitle>Kwoty faktury</SectionTitle>
        <AmountTable preview={preview} />
        <VatBreakdownTable preview={preview} />
      </section>

      <SettlementSection preview={preview} />
      <PaymentSection preview={preview} />

      <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
        <SectionTitle>Pozycje faktury</SectionTitle>
        {preview.lines.length > 0 ? (
          <LinesTable lines={preview.lines} />
        ) : preview.previewSource === "xml" ? (
          <p className="text-xs text-zinc-500">Brak pozycji w strukturze XML tej faktury.</p>
        ) : xmlFetching ? (
          <p className="rounded border border-dashed border-zinc-200 bg-zinc-50/60 px-2 py-2 text-xs leading-relaxed text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400">
            Pobieranie pełnej faktury z KSeF…
          </p>
        ) : (
          <p className="rounded border border-dashed border-zinc-200 bg-zinc-50/60 px-2 py-2 text-xs leading-relaxed text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400">
            Pozycje faktury będą widoczne po pobraniu XML z KSeF.
          </p>
        )}
      </section>

      <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
        <SectionTitle>Pełna faktura</SectionTitle>
        {xmlFetching ? (
          <p className="text-xs text-zinc-500">Pobieranie pełnej faktury z KSeF w tle…</p>
        ) : null}
        {xmlFetchStatus === "OK" && xmlFetchedAt ? (
          <p className="text-xs text-zinc-500">
            XML w cache · {xmlFetchedAt.slice(0, 16).replace("T", " ")}
          </p>
        ) : null}
        {xmlFetchError && !xmlFetching ? (
          <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {xmlFetchError}
          </p>
        ) : null}
        {canRefreshXml ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={acting || xmlFetching}
            onClick={() => onAction("fetch-xml", { forceXml: true })}
          >
            Odśwież XML
          </Button>
        ) : null}
        {source === "MOCK" ? (
          <p className="text-xs text-zinc-500">
            Pełny XML dostępny tylko dla dokumentów z produkcyjnego API KSeF.
          </p>
        ) : null}
      </section>

      <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
        <SectionTitle>Powiązania</SectionTitle>
        {workflowStatus === "IMPORTED" && importedAsCostInvoiceId ? (
          <p>
            <button
              type="button"
              className="text-blue-600 underline dark:text-blue-400"
              onClick={() => onOpenLinkedInvoice?.("cost", importedAsCostInvoiceId)}
            >
              Otwórz fakturę
            </button>
          </p>
        ) : null}
        {workflowStatus === "IMPORTED" && importedAsRevenueInvoiceId ? (
          <p>
            <button
              type="button"
              className="text-blue-600 underline dark:text-blue-400"
              onClick={() => onOpenLinkedInvoice?.("income", importedAsRevenueInvoiceId)}
            >
              Otwórz fakturę
            </button>
          </p>
        ) : null}
        {duplicateCostId ? (
          <p>
            <button
              type="button"
              className="text-amber-800 underline dark:text-amber-300"
              onClick={() => onOpenLinkedInvoice?.("cost", duplicateCostId)}
            >
              Już w systemie — otwórz fakturę kosztową
            </button>
            {duplicateCost ? (
              <span className="mt-0.5 block text-xs text-zinc-500">
                {duplicateCost.documentNumber} · {duplicateCost.supplier}
              </span>
            ) : null}
          </p>
        ) : null}
        {duplicateIncomeId ? (
          <p>
            <button
              type="button"
              className="text-amber-800 underline dark:text-amber-300"
              onClick={() => onOpenLinkedInvoice?.("income", duplicateIncomeId)}
            >
              Już w systemie — otwórz fakturę przychodową
            </button>
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
      </section>

      {!hideActions ? (
        <KsefDocumentDetailActions
          workflowStatus={workflowStatus}
          importedAsCostInvoiceId={importedAsCostInvoiceId}
          importedAsRevenueInvoiceId={importedAsRevenueInvoiceId}
          duplicateCostId={duplicateCostId}
          duplicateIncomeId={duplicateIncomeId}
          acting={acting}
          canUndoImport={canUndoImport}
          importBlockedReason={importBlockedReason}
          onAction={onAction}
          onOpenLinkedInvoice={onOpenLinkedInvoice}
        />
      ) : null}

      {canImportCost && onImportCostSubmit ? (
        <KsefImportForm
          direction="PURCHASE"
          ksefId={preview.ksefId}
          defaultPlannedDate={preview.paymentDueDate ?? preview.issueDate}
          invoiceGrossAmount={preview.invoiceGrossAmount}
          amountToPay={preview.amountToPay}
          acting={acting}
          focusSection={focusImportSection}
          onFocusHandled={onImportFocusHandled}
          onSubmitCost={onImportCostSubmit}
          onSubmitRevenue={() => {}}
        />
      ) : null}
      {canImportRevenue && onImportRevenueSubmit ? (
        <KsefImportForm
          direction="SALE"
          ksefId={preview.ksefId}
          defaultPlannedDate={preview.paymentDueDate ?? preview.issueDate}
          acting={acting}
          focusSection={focusImportSection}
          onFocusHandled={onImportFocusHandled}
          onSubmitCost={() => {}}
          onSubmitRevenue={onImportRevenueSubmit}
        />
      ) : null}

      {xmlPayload || rawPayload != null ? (
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
            <div className="mt-2 space-y-2">
              {xmlPayload ? (
                <div>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Surowy XML
                  </p>
                  <pre className="max-h-56 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 text-[10px] leading-snug text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {xmlPayload}
                  </pre>
                </div>
              ) : null}
              {rawPayload != null ? (
                <div>
                  <button
                    type="button"
                    className="text-[10px] text-zinc-500 underline"
                    onClick={() => setShowMetadata((v) => !v)}
                  >
                    {showMetadata ? "Ukryj metadane API" : "Pokaż metadane API (JSON)"}
                  </button>
                  {showMetadata ? (
                    <pre className="mt-1 max-h-40 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 text-[10px] leading-snug text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {JSON.stringify(rawPayload, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
