import { Suspense } from "react";
import { WatchtowerPage } from "@/components/insights/WatchtowerPage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <WatchtowerPage />
    </Suspense>
  );
}
