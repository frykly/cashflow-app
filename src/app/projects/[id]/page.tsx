import { notFound } from "next/navigation";
import { ProjectDetailView } from "@/components/ProjectDetailView";
import { getProjectDetails } from "@/lib/projects/getProjectDetails";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params;
  const data = await getProjectDetails(id);
  if (!data) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <ProjectDetailView data={data} />
    </div>
  );
}
