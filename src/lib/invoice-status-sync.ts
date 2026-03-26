import { prisma } from "@/lib/db";
import { computeCostStatus, computeIncomeStatus } from "@/lib/cashflow/settlement";

export async function syncIncomeInvoiceStatus(invoiceId: string) {
  const inv = await prisma.incomeInvoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!inv) return;
  const status = computeIncomeStatus(inv, inv.payments);
  await prisma.incomeInvoice.update({
    where: { id: invoiceId },
    data: { status },
  });
}

export async function syncCostInvoiceStatus(invoiceId: string) {
  const inv = await prisma.costInvoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!inv) return;
  const { status, paid } = computeCostStatus(inv, inv.payments);
  await prisma.costInvoice.update({
    where: { id: invoiceId },
    data: { status, paid },
  });
}
