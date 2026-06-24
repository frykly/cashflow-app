import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decToNumber, round2 } from "@/lib/cashflow/money";
import { projectLifecycleDisplay, projectSettlementDisplay } from "@/lib/project-status-labels";

const TAKE = 50;

type ContractorWithAliases = Prisma.ContractorGetPayload<{
  include: { aliases: true };
}>;

function nonEmptyNames(contractor: ContractorWithAliases): string[] {
  return [...new Set([contractor.displayName, ...contractor.aliases.map((a) => a.aliasName)].map((n) => n.trim()).filter(Boolean))];
}

function stringMatchFilter(field: string, names: string[]): Prisma.StringFilter[] {
  return names.map((name) => ({ contains: name }));
}

function sumPayments(payments: { amountGross: Prisma.Decimal }[]): number {
  return round2(payments.reduce((sum, p) => sum + decToNumber(p.amountGross), 0));
}

function remainingGross(grossAmount: Prisma.Decimal, payments: { amountGross: Prisma.Decimal }[]): number {
  return Math.max(0, round2(decToNumber(grossAmount) - sumPayments(payments)));
}

export async function getContractorDetails(id: string) {
  const contractor = await prisma.contractor.findUnique({
    where: { id },
    include: { aliases: { orderBy: [{ aliasName: "asc" }, { createdAt: "asc" }] } },
  });
  if (!contractor) return null;

  const [lifeOpts, setOpts] = await Promise.all([
    prisma.projectLifecycleStatusOption.findMany({ select: { slug: true, name: true } }),
    prisma.projectSettlementStatusOption.findMany({ select: { slug: true, name: true } }),
  ]);
  const lifeMap = new Map(lifeOpts.map((o) => [o.slug, o.name]));
  const setMap = new Map(setOpts.map((o) => [o.slug, o.name]));

  const names = nonEmptyNames(contractor);
  const incomeWhere: Prisma.IncomeInvoiceWhereInput =
    names.length > 0 ? { OR: stringMatchFilter("contractor", names).map((contractor) => ({ contractor })) } : {};
  const costWhere: Prisma.CostInvoiceWhereInput =
    names.length > 0 ? { OR: stringMatchFilter("supplier", names).map((supplier) => ({ supplier })) } : {};
  const projectWhere: Prisma.ProjectWhereInput =
    names.length > 0 ? { OR: stringMatchFilter("clientName", names).map((clientName) => ({ clientName })) } : {};
  const bankWhere: Prisma.BankTransactionWhereInput =
    names.length > 0 ? { OR: stringMatchFilter("counterpartyName", names).map((counterpartyName) => ({ counterpartyName })) } : {};

  const [
    incomeInvoices,
    costInvoices,
    projects,
    bankTransactions,
    projectContractorLinks,
    incomeSummaryRows,
    costSummaryRows,
    projectSummaryRows,
    bankSummaryRows,
  ] = await Promise.all([
    prisma.incomeInvoice.findMany({
      where: incomeWhere,
      orderBy: { issueDate: "desc" },
      take: TAKE,
      select: {
        id: true,
        invoiceNumber: true,
        contractor: true,
        grossAmount: true,
        issueDate: true,
        status: true,
      },
    }),
    prisma.costInvoice.findMany({
      where: costWhere,
      orderBy: { documentDate: "desc" },
      take: TAKE,
      select: {
        id: true,
        documentNumber: true,
        supplier: true,
        grossAmount: true,
        documentDate: true,
        paymentDueDate: true,
        status: true,
        payments: { select: { amountGross: true } },
      },
    }),
    prisma.project.findMany({
      where: projectWhere,
      orderBy: { updatedAt: "desc" },
      take: TAKE,
      select: {
        id: true,
        name: true,
        code: true,
        clientName: true,
        isActive: true,
        updatedAt: true,
        lifecycleStatus: true,
        settlementStatus: true,
        missingItems: {
          select: {
            id: true,
            missingType: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    }),
    prisma.bankTransaction.findMany({
      where: bankWhere,
      orderBy: { bookingDate: "desc" },
      take: TAKE,
      select: {
        id: true,
        importId: true,
        bookingDate: true,
        amount: true,
        currency: true,
        description: true,
        counterpartyName: true,
        status: true,
      },
    }),
    prisma.projectContractor.findMany({
      where: { contractorId: id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            code: true,
            clientName: true,
            isActive: true,
            updatedAt: true,
            lifecycleStatus: true,
            settlementStatus: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    }),
    prisma.incomeInvoice.findMany({
      where: incomeWhere,
      select: {
        grossAmount: true,
        payments: { select: { amountGross: true } },
      },
    }),
    prisma.costInvoice.findMany({
      where: costWhere,
      select: {
        grossAmount: true,
        payments: { select: { amountGross: true } },
      },
    }),
    prisma.project.findMany({
      where: projectWhere,
      select: {
        isActive: true,
      },
    }),
    prisma.bankTransaction.findMany({
      where: bankWhere,
      select: {
        amount: true,
      },
    }),
  ]);

  const incomeGross = round2(incomeSummaryRows.reduce((sum, r) => sum + decToNumber(r.grossAmount), 0));
  const incomeReceived = round2(incomeSummaryRows.reduce((sum, r) => sum + sumPayments(r.payments), 0));
  const incomeRemaining = round2(incomeSummaryRows.reduce((sum, r) => sum + remainingGross(r.grossAmount, r.payments), 0));
  const costGross = round2(costSummaryRows.reduce((sum, r) => sum + decToNumber(r.grossAmount), 0));
  const costPaid = round2(costSummaryRows.reduce((sum, r) => sum + sumPayments(r.payments), 0));
  const costRemaining = round2(costSummaryRows.reduce((sum, r) => sum + remainingGross(r.grossAmount, r.payments), 0));
  const bankIncome = round2(bankSummaryRows.reduce((sum, r) => sum + (r.amount > 0 ? r.amount / 100 : 0), 0));
  const bankExpenses = round2(bankSummaryRows.reduce((sum, r) => sum + (r.amount < 0 ? Math.abs(r.amount) / 100 : 0), 0));
  const contractorProjects = projectContractorLinks
    .map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      project: {
        ...r.project,
        updatedAt: r.project.updatedAt.toISOString(),
        lifecycleDisplay: projectLifecycleDisplay(r.project.lifecycleStatus, lifeMap),
        settlementDisplay: projectSettlementDisplay(r.project.settlementStatus, setMap),
      },
    }))
    .sort((a, b) => {
      const aActive = a.project.isActive && a.project.lifecycleStatus !== "COMPLETED";
      const bActive = b.project.isActive && b.project.lifecycleStatus !== "COMPLETED";
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.project.name.localeCompare(b.project.name, "pl");
    });

  return {
    contractor: {
      ...contractor,
      createdAt: contractor.createdAt.toISOString(),
      updatedAt: contractor.updatedAt.toISOString(),
      aliases: contractor.aliases.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
    },
    related: {
      incomeInvoices: incomeInvoices.map((r) => ({
        ...r,
        grossAmount: r.grossAmount.toString(),
        issueDate: r.issueDate.toISOString(),
      })),
      costInvoices: costInvoices.map((r) => {
        const paidAmount = sumPayments(r.payments);
        const remainingAmount = remainingGross(r.grossAmount, r.payments);
        return {
          id: r.id,
          documentNumber: r.documentNumber,
          supplier: r.supplier,
          grossAmount: r.grossAmount.toString(),
          paidAmount,
          remainingAmount,
          documentDate: r.documentDate.toISOString(),
          paymentDueDate: r.paymentDueDate?.toISOString() ?? null,
          status: r.status,
        };
      }),
      projects: projects.map((r) => ({
        ...r,
        updatedAt: r.updatedAt.toISOString(),
        lifecycleDisplay: projectLifecycleDisplay(r.lifecycleStatus, lifeMap),
        settlementDisplay: projectSettlementDisplay(r.settlementStatus, setMap),
        missingItems: r.missingItems.map((m) => ({
          id: m.id,
          missingType: m.missingType,
        })),
      })),
      bankTransactions: bankTransactions.map((r) => ({
        ...r,
        bookingDate: r.bookingDate.toISOString(),
      })),
      contractorProjects,
    },
    summary: {
      income: {
        count: incomeSummaryRows.length,
        grossAmount: incomeGross,
        receivedAmount: incomeReceived,
        remainingAmount: incomeRemaining,
      },
      costs: {
        count: costSummaryRows.length,
        grossAmount: costGross,
        paidAmount: costPaid,
        remainingAmount: costRemaining,
      },
      projects: {
        count: projectSummaryRows.length,
        activeCount: projectSummaryRows.filter((r) => r.isActive).length,
      },
      bank: {
        count: bankSummaryRows.length,
        incomeAmount: bankIncome,
        expenseAmount: bankExpenses,
      },
    },
  };
}

export type ContractorDetailsResult = NonNullable<Awaited<ReturnType<typeof getContractorDetails>>>;
