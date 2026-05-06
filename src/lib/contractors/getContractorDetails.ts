import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

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

export async function getContractorDetails(id: string) {
  const contractor = await prisma.contractor.findUnique({
    where: { id },
    include: { aliases: { orderBy: [{ aliasName: "asc" }, { createdAt: "asc" }] } },
  });
  if (!contractor) return null;

  const names = nonEmptyNames(contractor);
  const incomeWhere: Prisma.IncomeInvoiceWhereInput =
    names.length > 0 ? { OR: stringMatchFilter("contractor", names).map((contractor) => ({ contractor })) } : {};
  const costWhere: Prisma.CostInvoiceWhereInput =
    names.length > 0 ? { OR: stringMatchFilter("supplier", names).map((supplier) => ({ supplier })) } : {};
  const projectWhere: Prisma.ProjectWhereInput =
    names.length > 0 ? { OR: stringMatchFilter("clientName", names).map((clientName) => ({ clientName })) } : {};
  const bankWhere: Prisma.BankTransactionWhereInput =
    names.length > 0 ? { OR: stringMatchFilter("counterpartyName", names).map((counterpartyName) => ({ counterpartyName })) } : {};

  const [incomeInvoices, costInvoices, projects, bankTransactions] = await Promise.all([
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
        status: true,
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
  ]);

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
      costInvoices: costInvoices.map((r) => ({
        ...r,
        grossAmount: r.grossAmount.toString(),
        documentDate: r.documentDate.toISOString(),
      })),
      projects: projects.map((r) => ({
        ...r,
        updatedAt: r.updatedAt.toISOString(),
      })),
      bankTransactions: bankTransactions.map((r) => ({
        ...r,
        bookingDate: r.bookingDate.toISOString(),
      })),
    },
  };
}

export type ContractorDetailsResult = NonNullable<Awaited<ReturnType<typeof getContractorDetails>>>;
