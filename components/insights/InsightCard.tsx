"use client";

import Link from "next/link";
import { ArrowRight, CornerDownRight } from "lucide-react";
import type { Insight } from "@/lib/data/narratives";
import { Card, cn, SeverityBadge } from "../ui/primitives";

const bar = { critical: "bg-bad", high: "bg-warn", medium: "bg-indigo", low: "bg-slate-soft" } as const;

export function InsightCard({ insight, index = 0 }: { insight: Insight; index?: number }) {
  return (
    <Card id={insight.id} className="relative animate-rise overflow-hidden p-0" style={{ animationDelay: `${index * 70}ms` }}>
      <span className={cn("absolute inset-y-0 left-0 w-1.5", bar[insight.severity])} />
      <div className="grid gap-6 p-5 pl-7 sm:p-6 sm:pl-8 lg:grid-cols-[230px_1fr_auto]">
        <div>
          <SeverityBadge severity={insight.severity} />
          <div className="eyebrow mt-4">{insight.metric.label}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="num-display text-[34px] leading-none">{insight.metric.value}</span>
            {insight.metric.delta && <span className={cn("num text-sm font-bold", insight.metric.tone === "bad" ? "text-bad" : insight.metric.tone === "good" ? "text-good" : "text-mute")}>{insight.metric.delta}</span>}
          </div>
        </div>
        <div>
          <h3 className="text-[18px] font-semibold leading-snug tracking-tight">{insight.title}</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{insight.insight}</p>
          <div className="mt-4">
            <div className="eyebrow mb-1.5">Supporting evidence</div>
            <ul className="space-y-1 text-[13px] text-mute">
              {insight.evidence.map((e) => (
                <li key={e} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-slate-soft" />{e}</li>
              ))}
            </ul>
          </div>
          <div className="mt-4 flex gap-2 rounded-xl bg-subtle px-3.5 py-2.5 text-[13px]">
            <CornerDownRight className="mt-0.5 size-4 shrink-0 text-mute" />
            <span><strong>Recommended action:</strong> <span className="text-ink-2">{insight.action}</span></span>
          </div>
        </div>
        <div className="flex items-end lg:items-center">
          <Link href={insight.explore.href} className="group inline-flex h-10 items-center gap-2 rounded-full bg-panel px-4 text-[13px] font-semibold text-white transition hover:bg-panel-2">
            {insight.explore.label} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
