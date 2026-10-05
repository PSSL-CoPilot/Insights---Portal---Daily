import { Suspense } from "react";
import { DetailedAnalysis } from "@/components/analysis/DetailedAnalysis";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DetailedAnalysis />
    </Suspense>
  );
}
