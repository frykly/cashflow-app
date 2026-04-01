import { BankTransactionDetailClient } from "@/components/BankTransactionDetailClient";

export default async function BankTransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string; transactionId: string }>;
}) {
  const { id, transactionId } = await params;
  return <BankTransactionDetailClient importId={id} transactionId={transactionId} />;
}
