/** Kwota w groszach → PLN do tabeli. */
export function formatPlnFromGrosze(grosze: number): string {
  return (grosze / 100).toLocaleString("pl-PL", { style: "currency", currency: "PLN" });
}
