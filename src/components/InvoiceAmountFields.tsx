"use client";

import { Field, Input, Select } from "@/components/ui";
import type { VatRatePct } from "@/lib/vat-rate";

export type AmountEntryMode = "net" | "gross";

type Props = {
  mode: AmountEntryMode;
  onModeChange: (m: AmountEntryMode) => void;
  netAmount: string;
  vatRate: number;
  vatAmount: string;
  grossAmount: string;
  disabled: boolean;
  onNetChange: (net: string) => void;
  onGrossChange: (gross: string) => void;
  onVatRateChange: (rate: VatRatePct) => void;
};

export function InvoiceAmountFields({
  mode,
  onModeChange,
  netAmount,
  vatRate,
  vatAmount,
  grossAmount,
  disabled,
  onNetChange,
  onGrossChange,
  onVatRateChange,
}: Props) {
  const netEditable = mode === "net";
  const grossEditable = mode === "gross";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="invoiceAmountMode"
            className="size-4"
            checked={mode === "net"}
            onChange={() => onModeChange("net")}
            disabled={disabled}
          />
          Wprowadzam netto
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="invoiceAmountMode"
            className="size-4"
            checked={mode === "gross"}
            onChange={() => onModeChange("gross")}
            disabled={disabled}
          />
          Wprowadzam brutto
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Kwota netto">
          <Input
            value={netAmount}
            onChange={(e) => onNetChange(e.target.value)}
            required={netEditable}
            disabled={disabled}
            readOnly={!netEditable}
            className={!netEditable ? "bg-zinc-50 dark:bg-zinc-900" : undefined}
            inputMode="decimal"
            autoComplete="off"
          />
        </Field>
        <Field label="Stawka VAT">
          <Select
            value={String(vatRate)}
            onChange={(e) => onVatRateChange(Number(e.target.value) as VatRatePct)}
            disabled={disabled}
          >
            <option value="0">0%</option>
            <option value="8">8%</option>
            <option value="23">23%</option>
          </Select>
        </Field>
        <Field label="Kwota VAT">
          <Input readOnly className="bg-zinc-50 dark:bg-zinc-900" value={vatAmount} />
        </Field>
        <Field label="Brutto">
          <Input
            value={grossAmount}
            onChange={(e) => onGrossChange(e.target.value)}
            required={grossEditable}
            disabled={disabled}
            readOnly={!grossEditable}
            className={!grossEditable ? "bg-zinc-50 dark:bg-zinc-900" : undefined}
            inputMode="decimal"
            autoComplete="off"
          />
        </Field>
      </div>
    </div>
  );
}
