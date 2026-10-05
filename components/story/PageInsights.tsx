"use client";

import { useMemo } from "react";
import { useApp } from "../AppContext";
import { NarrativeBlock } from "./NarrativeList";
import { buildActionsNarrative, buildCancellationsNarrative, buildInsightsNarrative, buildJourneyNarrative, buildWatchtowerNarrative } from "@/lib/story/pages";
import { monthLabel } from "@/lib/format";

export type InsightPage = "cancellations" | "watchtower" | "actions" | "journey" | "insights";

/** The primary read-out at the top of every page: plain-language insight first, evidence on demand. */
export function PageInsights({ page, scope }: { page: InsightPage; scope?: string | null }) {
  const { model, month, state } = useApp();
  const sc = scope !== undefined ? scope : state && model.states.includes(state) ? state : null;
  const points = useMemo(() => {
    switch (page) {
      case "cancellations": return buildCancellationsNarrative(model, month, sc);
      case "watchtower": return buildWatchtowerNarrative(model, month, sc);
      case "actions": return buildActionsNarrative(model, month);
      case "journey": return buildJourneyNarrative(model, month);
      case "insights": return buildInsightsNarrative(model, month);
    }
  }, [page, model, month, sc]);
  return <NarrativeBlock points={points} resetKey={`${page}-${month}-${sc ?? ""}`} eyebrow={`${sc ?? "Portfolio"} · ${monthLabel(month)}`} />;
}
