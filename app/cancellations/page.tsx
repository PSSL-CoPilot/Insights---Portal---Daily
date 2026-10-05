import { Suspense } from "react";
import { CancellationsPage } from "@/components/insights/CancellationsPage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CancellationsPage />
    </Suspense>
  );
}
