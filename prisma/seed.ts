import { PrismaClient } from "@prisma/client";
import { addDays, startOfDay } from "date-fns";

const prisma = new PrismaClient();

const force = process.argv.includes("--force");

/** Suma rekordów we wszystkich tabelach używanych przez aplikację — jeśli > 0, baza nie jest „świeża”. */
async function countAllDomainRows(): Promise<number> {
  const [a, i, c, p, r, ic, ec] = await Promise.all([
    prisma.appSettings.count(),
    prisma.incomeInvoice.count(),
    prisma.costInvoice.count(),
    prisma.plannedFinancialEvent.count(),
    prisma.recurringTemplate.count(),
    prisma.incomeCategory.count(),
    prisma.expenseCategory.count(),
  ]);
  return a + i + c + p + r + ic + ec;
}

const CATEGORY_DEFS = [
  { slug: "sprzedaz", name: "Sprzedaż" },
  { slug: "uslugi", name: "Usługi" },
  { slug: "marketing", name: "Marketing" },
  { slug: "ksiegowosc", name: "Księgowość" },
  { slug: "narzedzia", name: "Narzędzia" },
  { slug: "podatki", name: "Podatki" },
  { slug: "zus", name: "ZUS" },
  { slug: "wynagrodzenia", name: "Wynagrodzenia" },
  { slug: "leasing", name: "Leasing" },
  { slug: "inne", name: "Inne" },
];

async function main() {
  const total = await countAllDomainRows();

  if (!force && total > 0) {
    console.log("");
    console.log("Seed przerwany: w bazie są już dane (faktury, kategorie, ustawienia itd.).");
    console.log("Nic nie zostało usunięte ani nadpisane.");
    console.log("");
    console.log("Żeby wymusić załadowanie danych demo (to USUNIE obecne dane i wstawi przykłady), uruchom:");
    console.log("  npm run db:seed -- --force");
    console.log("");
    return;
  }

  if (force && total > 0) {
    console.log("Tryb --force: czyszczenie istniejących danych i wgrywanie demo…");
  }

  const today = startOfDay(new Date());

  await prisma.appSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      mainOpeningBalance: 25000,
      vatOpeningBalance: 5000,
      effectiveFrom: addDays(today, -60),
    },
    update: {
      mainOpeningBalance: 25000,
      vatOpeningBalance: 5000,
      effectiveFrom: addDays(today, -60),
    },
  });

  await prisma.incomeInvoice.deleteMany();
  await prisma.costInvoice.deleteMany();
  await prisma.plannedFinancialEvent.deleteMany();
  await prisma.recurringTemplate.deleteMany();
  await prisma.incomeCategory.deleteMany();
  await prisma.expenseCategory.deleteMany();

  for (const c of CATEGORY_DEFS) {
    await prisma.incomeCategory.create({ data: c });
    await prisma.expenseCategory.create({ data: c });
  }

  const incBySlug = Object.fromEntries(
    (await prisma.incomeCategory.findMany()).map((c) => [c.slug, c.id]),
  );
  const expBySlug = Object.fromEntries(
    (await prisma.expenseCategory.findMany()).map((c) => [c.slug, c.id]),
  );

  await prisma.incomeInvoice.createMany({
    data: [
      {
        invoiceNumber: "FV/2026/01",
        contractor: "Klient A",
        description: "Usługa IT",
        vatRate: 23,
        netAmount: 10000,
        vatAmount: 2300,
        grossAmount: 12300,
        issueDate: addDays(today, -5),
        paymentDueDate: addDays(today, 10),
        plannedIncomeDate: addDays(today, 10),
        status: "WYSTAWIONA",
        vatDestination: "VAT",
        confirmedIncome: false,
        notes: "",
        incomeCategoryId: incBySlug["uslugi"],
      },
      {
        invoiceNumber: "FV/2026/02",
        contractor: "Klient B",
        description: "Konsultacje",
        vatRate: 23,
        netAmount: 5000,
        vatAmount: 1150,
        grossAmount: 6150,
        issueDate: addDays(today, -12),
        paymentDueDate: addDays(today, -2),
        plannedIncomeDate: addDays(today, -2),
        status: "OPLACONA",
        vatDestination: "MAIN",
        confirmedIncome: true,
        actualIncomeDate: addDays(today, -3),
        notes: "",
        incomeCategoryId: incBySlug["sprzedaz"],
      },
    ],
  });

  await prisma.costInvoice.createMany({
    data: [
      {
        documentNumber: "FK/10/2026",
        supplier: "Dostawca X",
        description: "Hosting",
        vatRate: 23,
        netAmount: 400,
        vatAmount: 92,
        grossAmount: 492,
        documentDate: addDays(today, -8),
        paymentDueDate: addDays(today, 5),
        plannedPaymentDate: addDays(today, 5),
        status: "DO_ZAPLATY",
        paid: false,
        paymentSource: "MAIN",
        notes: "",
        expenseCategoryId: expBySlug["narzedzia"],
      },
      {
        documentNumber: "FK/11/2026",
        supplier: "Urząd",
        description: "VAT",
        vatRate: 23,
        netAmount: 0,
        vatAmount: 2000,
        grossAmount: 2000,
        documentDate: addDays(today, -1),
        paymentDueDate: addDays(today, 12),
        plannedPaymentDate: addDays(today, 12),
        status: "PLANOWANA",
        paid: false,
        paymentSource: "VAT",
        notes: "",
        expenseCategoryId: expBySlug["podatki"],
      },
    ],
  });

  await prisma.plannedFinancialEvent.createMany({
    data: [
      {
        type: "EXPENSE",
        title: "Wynagrodzenia",
        description: "Przelew zbiorczy",
        amount: 12000,
        plannedDate: addDays(today, 14),
        status: "PLANNED",
        notes: "",
        expenseCategoryId: expBySlug["wynagrodzenia"],
      },
      {
        type: "INCOME",
        title: "Zwrot kaucji",
        description: "",
        amount: 1500,
        plannedDate: addDays(today, 20),
        status: "PLANNED",
        notes: "",
        incomeCategoryId: incBySlug["inne"],
      },
    ],
  });

  await prisma.recurringTemplate.create({
    data: {
      title: "Abonament narzędzia",
      type: "EXPENSE",
      amount: 299,
      frequency: "MONTHLY",
      startDate: today,
      dayOfMonth: Math.min(28, today.getDate()),
      expenseCategoryId: expBySlug["narzedzia"],
      isActive: true,
    },
  });

  console.log(force ? "Seed OK (demo wgrane po --force)." : "Seed OK (świeża baza — dane demo wgrane).");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
