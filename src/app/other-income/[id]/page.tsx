import { OtherIncomeDetailClient } from "@/components/OtherIncomeDetailClient";

export default async function OtherIncomeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OtherIncomeDetailClient id={id} />;
}
