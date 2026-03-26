import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { recurringTemplateCreateSchema } from "@/lib/validation/schemas";
import { recurringSplitAmountError } from "@/lib/validation/recurring-split";
import { ZodError } from "zod";

export async function GET() {
  const rows = await prisma.recurringTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: { incomeCategory: true, expenseCategory: true },
  });
  return jsonData(rows);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  try {
    const data = recurringTemplateCreateSchema.parse(body);
    const mode = data.accountMode ?? "MAIN";
    const splitErr = recurringSplitAmountError(mode, data.amountVat ?? null);
    if (splitErr) return jsonError(splitErr, 400);

    const row = await prisma.recurringTemplate.create({
      data: {
        title: data.title,
        type: data.type,
        accountMode: mode,
        amount: data.amount,
        amountVat: mode === "SPLIT" ? data.amountVat! : null,
        incomeCategoryId: data.type === "INCOME" ? (data.incomeCategoryId ?? null) : null,
        expenseCategoryId: data.type === "EXPENSE" ? (data.expenseCategoryId ?? null) : null,
        frequency: data.frequency,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        dayOfMonth: data.dayOfMonth ?? null,
        weekday: data.weekday ?? null,
        notes: data.notes ?? "",
        isActive: data.isActive ?? true,
      },
      include: { incomeCategory: true, expenseCategory: true },
    });
    return jsonData(row, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
