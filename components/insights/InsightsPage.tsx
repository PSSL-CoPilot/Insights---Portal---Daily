"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { PageInsights } from "../story/PageInsights";
import { useApp } from "../AppContext";
import { InsightCard } from "./InsightCard";
import { Card, cn, SectionTitle } from "../ui/primitives";
import { buildInsights, type Severity } from "@/lib/data/narratives";
import { monthLabel } from "@/lib/format";

const SEVS: { id: Severity | "all"; label: string }[] = [
  { id: "all", label: "All" }, { id: "critical", label: "Critical" }, { id: "high", label: "High" }, { id: "medium", label: "Medium" }, { id: "low", label: "Low" },
];

const DRILL_HREF: Record<string, string> = { "monthly overview": "/", "odd timing": "/cancellations?tab=timing", "september state drill": "/states", "watchtower signals": "/watchtower", "customer miss reasons": "/cancellations?tab=miss", "example journey": "/journey" };

export function InsightsPage() {
  const { model, month } = useApp();
  const [sev, setSev] = useState<Severity | "all">("all");
  const all = useMemo(() => buildInsights(model, month), [model, month]);
  const shown = sev === "all" ? all : all.filter((i) => i.severity === sev);
  const count = (s: Severity) => all.filter((i) => i.severity === s).length;

  return (
    <div className="space-y-9">
      <SectionTitle eyebrow={`Insights · ${monthLabel(month)}`} title="What does the data say?" sub="Generated from the data: each insight reflects this month’s numbers, with its supporting evidence and a recommended next step." />
      <PageInsights page="insights" scope={null} />

      <div className="flex flex-wrap items-center gap-2.5">
        {SEVS.map((s) => (
          <button key={s.id} onClick={() => setSev(s.id)} className={cn("rounded-full border px-4 py-1.5 text-[13px] font-semibold transition", sev === s.id ? "border-ink bg-panel text-white" : "border-line bg-card text-mute hover:border-ink hover:text-ink")}>
            {s.label}
            <span className={cn("ml-2 text-xs", sev === s.id ? "text-brand" : "text-soft")}>{s.id === "all" ? all.length : count(s.id)}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card className="p-10 text-center text-sm text-mute">No insights at this severity for {monthLabel(month)}.</Card>
      ) : (
        <div className="space-y-4">
          {shown.map((i, k) => <InsightCard key={i.id} insight={i} index={k} />)}
        </div>
      )}

      {model.executiveQuestions.length > 0 && (
        <details className="group rounded-[22px] border border-line bg-card shadow-card" open={false}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
            <div>
              <div className="eyebrow mb-1">Executive questions</div>
              <div className="text-[20px] font-semibold tracking-tight">The five executive questions, answered by the data</div>
              <div className="mt-1 text-sm text-mute">Expand to read each answer with its evidence and recommended next step.</div>
            </div>
            <span className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-subtle transition group-open:rotate-180"><ChevronDown className="size-4" /></span>
          </summary>
          <div className="divide-y divide-line-2 border-t border-line-2">
            {model.executiveQuestions.map((q) => {
              const href = DRILL_HREF[q.drill.toLowerCase().split("/")[0].trim()] ?? "/";
              return (
                <details key={q.n} className="group/q px-5 sm:px-6">
                  <summary className="flex cursor-pointer list-none items-center gap-3 py-4 [&::-webkit-details-marker]:hidden">
                    <span className="bs-gradient grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold text-[#111]">{q.n}</span>
                    <h4 className="flex-1 text-[15px] font-semibold leading-snug">{q.question}</h4>
                    <ChevronDown className="size-4 shrink-0 text-mute transition group-open/q:rotate-180" />
                  </summary>
                  <div className="pb-5 pl-10">
                    <p className="text-[14px] leading-relaxed text-ink-2">{q.answer}</p>
                    {q.evidence && <p className="mt-2 text-[13px] text-mute"><strong className="text-ink-2">Evidence:</strong> {q.evidence}</p>}
                    {q.nextStep && <p className="mt-1 text-[13px] text-mute"><strong className="text-ink-2">Recommended next step:</strong> {q.nextStep}</p>}
                    {q.drill && <Link href={href} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline decoration-dotted">Open {q.drill} <ArrowRight className="size-3" /></Link>}
                  </div>
                </details>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
