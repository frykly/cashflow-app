import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { extractTextFromPdfBuffer } from "@/lib/invoice-pdf/extract-text";
import { parsePolishInvoiceText } from "@/lib/invoice-pdf/parse-pl";
import type { InvoicePdfDraftResponse } from "@/lib/invoice-pdf/types";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

const KEY_LABEL: Record<string, string> = {
  documentNumber: "Numer dokumentu",
  invoiceNumber: "Numer faktury",
  supplier: "Dostawca",
  contractor: "Kontrahent",
  description: "Opis",
  documentDate: "Data dokumentu",
  issueDate: "Data wystawienia",
  paymentDueDate: "Termin płatności",
  netAmount: "Netto",
  vatAmount: "VAT",
  grossAmount: "Brutto",
  vatRate: "Stawka VAT",
};

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Nieprawidłowe żądanie", 400);
  }

  const file = form.get("file");
  const kindRaw = form.get("kind");
  if (!(file instanceof Blob)) {
    return jsonError("Brak pliku PDF (pole „file”).", 422);
  }
  const kind = kindRaw === "income" ? "income" : kindRaw === "cost" ? "cost" : null;
  if (!kind) {
    return jsonError('Podaj kind: „cost” lub „income”.', 422);
  }

  if (file.type && file.type !== "application/pdf") {
    return jsonError("Dozwolony jest tylko plik PDF.", 400);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    return jsonError("Plik jest za duży (max 10 MB).", 400);
  }
  if (buf.length < 8) {
    return jsonError("Plik jest pusty lub uszkodzony.", 400);
  }
  const head = buf.subarray(0, 5).toString("latin1");
  if (!head.startsWith("%PDF-")) {
    return jsonError("To nie wygląda na prawidłowy plik PDF.", 400);
  }

  let text: string;
  let numPages: number;
  try {
    const r = await extractTextFromPdfBuffer(buf);
    text = r.text;
    numPages = r.numPages;
  } catch {
    return jsonError("Nie udało się odczytać PDF — spróbuj innego pliku.", 500);
  }

  const warnings: string[] = [];
  if (!text.trim()) {
    warnings.push("Brak warstwy tekstowej (np. skan) — nie rozpoznano treści. Wypełnij formularz ręcznie.");
  }
  if (numPages === 0 && text.trim()) {
    warnings.push("Nie udało się odczytać liczby stron — kontynuacja parsowania tekstu.");
  }

  const parsed = parsePolishInvoiceText(text, kind);
  for (const w of parsed.warnings) {
    if (!warnings.includes(w)) warnings.push(w);
  }

  const { warnings: _pw, filledFieldKeys, ...values } = parsed;

  const filledLabels = filledFieldKeys.map((k) => KEY_LABEL[k] ?? k);

  console.log("[invoice-pdf-e2e-api-response]", values);

  const body: InvoicePdfDraftResponse = {
    warnings,
    filledFieldKeys,
    filledLabels,
    values,
    textLength: text.length,
  };

  return jsonData(body);
}
