import { loadDataModel } from "@/lib/data/excelLoader";
import { stateSlug } from "@/lib/format";
import { PlanRoute } from "@/components/drilldown/StateRoute";

export default async function StateDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PlanRoute kind="state" slug={slug} />;
}

export function generateStaticParams() {
  return loadDataModel().states.map((s) => ({ slug: stateSlug(s) }));
}
