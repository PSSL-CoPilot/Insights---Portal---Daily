import { ExecutiveStory } from "@/components/story/ExecutiveStory";
import { OverviewStrip } from "@/components/kpi/OverviewStrip";
import { KPIGrid } from "@/components/kpi/KPIGrid";

export default function CommandCenterPage() {
  return (
    <div className="space-y-12">
      <div className="space-y-4">
        <ExecutiveStory />
        <OverviewStrip />
      </div>
      <KPIGrid />
    </div>
  );
}
