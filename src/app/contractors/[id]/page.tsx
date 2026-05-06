import { notFound } from "next/navigation";
import { ContractorDetailClient } from "@/components/ContractorDetailClient";
import { getContractorDetails } from "@/lib/contractors/getContractorDetails";

type Props = { params: Promise<{ id: string }> };

export default async function ContractorDetailPage({ params }: Props) {
  const { id } = await params;
  const data = await getContractorDetails(id);
  if (!data) notFound();
  return <ContractorDetailClient data={data} />;
}
