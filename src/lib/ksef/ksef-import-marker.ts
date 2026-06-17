export const KSEF_IMPORT_NOTES_PREFIX = "Import KSeF:";

export function isKsefImportedInvoiceNotes(notes: string): boolean {
  return notes.includes(KSEF_IMPORT_NOTES_PREFIX);
}

export function ksefImportNotes(ksefId: string): string {
  return `${KSEF_IMPORT_NOTES_PREFIX} ${ksefId}`;
}
