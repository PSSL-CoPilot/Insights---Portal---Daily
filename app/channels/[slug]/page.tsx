import { loadDataModel } from "@/lib/data/excelLoader";
import { stateSlug } from "@/lib/format";
import { PlanRoute } from "@/components/drilldown/StateRoute";

export default async function ChannelDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PlanRoute kind="channel" slug={slug} />;
}

export function generateStaticParams() {
  return loadDataModel().channelNames.map((c) => ({ slug: stateSlug(c) }));
}
