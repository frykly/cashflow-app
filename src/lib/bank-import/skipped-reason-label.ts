/** Krótka etykieta powodu pominięcia (lista importów, szczegóły importu). */
export function bankImportSkippedReasonLabel(
  reason: "existing_in_database" | "duplicate_within_file" | "legacy_strong_match" | string,
): string {
  if (reason === "existing_in_database") return "Duplikat w bazie";
  if (reason === "duplicate_within_file") return "Duplikat w pliku";
  if (reason === "legacy_strong_match") return "Duplikat wykryty po dacie, kwocie i opisie";
  return typeof reason === "string" ? reason : "Nieznany powód";
}
