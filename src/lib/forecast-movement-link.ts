/**
 * Build edit URL for forecast movement rows. refId may include suffixes
 * (-p-<paymentId> for income/cost, -rem for remainder).
 */
export function hrefForForecastMovement(m: { kind: string; refId: string }): string | null {
  const ref = String(m.refId ?? "").trim();
  if (!ref) return null;
  if (m.kind === "income") {
    const invId = ref.includes("-p-") ? ref.split("-p-")[0]! : ref.endsWith("-rem") ? ref.slice(0, -"-rem".length) : ref;
    return `/income-invoices?editIncome=${encodeURIComponent(invId)}`;
  }
  if (m.kind === "cost") {
    const invId = ref.includes("-p-") ? ref.split("-p-")[0]! : ref.endsWith("-rem") ? ref.slice(0, -"-rem".length) : ref;
    return `/cost-invoices?editCost=${encodeURIComponent(invId)}`;
  }
  if (m.kind === "planned") {
    return `/planned-events?editPlanned=${encodeURIComponent(ref)}`;
  }
  return null;
}
