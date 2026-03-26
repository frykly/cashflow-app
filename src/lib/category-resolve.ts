import { prisma } from "@/lib/db";

function slugifyBase(s: string): string {
  const x = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return x || "kategoria";
}

export async function resolveIncomeCategoryByName(name: string | null | undefined): Promise<string | null> {
  const n = name?.trim();
  if (!n) return null;
  const all = await prisma.incomeCategory.findMany();
  const found = all.find((c) => c.name.toLowerCase() === n.toLowerCase());
  if (found) return found.id;
  const slug = `${slugifyBase(n)}-${Date.now().toString(36)}`;
  const row = await prisma.incomeCategory.create({ data: { name: n, slug } });
  return row.id;
}

export async function resolveExpenseCategoryByName(name: string | null | undefined): Promise<string | null> {
  const n = name?.trim();
  if (!n) return null;
  const all = await prisma.expenseCategory.findMany();
  const found = all.find((c) => c.name.toLowerCase() === n.toLowerCase());
  if (found) return found.id;
  const slug = `${slugifyBase(n)}-${Date.now().toString(36)}`;
  const row = await prisma.expenseCategory.create({ data: { name: n, slug } });
  return row.id;
}
