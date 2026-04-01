import { BankImportDetailClient } from "@/components/BankImportDetailClient";

export default async function BankImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BankImportDetailClient importId={id} />;
}
