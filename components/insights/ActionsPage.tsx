"use client";

import { useMemo } from "react";
import { Target } from "lucide-react";
import { PageInsights } from "../story/PageInsights";
import { useApp } from "../AppContext";
import { ActionCard, useActionStore } from "./ActionCard";
import { Card, cn, dirTone, SectionTitle } from "../ui/primitives";
import { buildActions } from "@/lib/data/narratives";
import { getSnapshot, kpiById, prevMonth, kpiDelta } from "@/lib/data/metrics";
import { formatCompactKpi } from "../kpi/KPICard";
import { fmtPp, fmtSignedPct, monthLabel, monthShort } from "@/lib/format";

const WATCH = ["post", "pending", "r-noaccess", "r-resched", "r-tech", "cancelRate"] as const;

export function ActionsPage() {
  const { model, month, openKpi } = useApp();
  const actions = useMemo(() => buildActions(model, month), [model, month]);
  const [store, update] = useActionStore();
  const pm = prevMonth(model, month);
  const snap = getSnapshot(model, month, null);
  const initiated = actions.filter((a) => store[a.id]?.initiatedAt).length;

  return (
    <div className="space-y-10">
      <SectionTitle
        eyebrow={`Actions · ${monthLabel(month)}`}
        title="What should Brightspeed do next?"
        sub="Insights translated into owned, prioritised actions. Initiate an action to draft the email to its owner from the data, review it, and send it; status is then tracked here."
        right={<div className="rounded-full border border-line bg-card px-4 py-2 text-[13px] font-semibold shadow-card"><span className="num">{initiated}</span> of {actions.length} actions initiated</div>}
      />
      <PageInsights page="actions" />

      <div className="grid gap-5 xl:grid-cols-2">
        {actions.map((a, i) => (
          <ActionCard key={a.id} action={a} month={month} index={i} record={store[a.id]} onUpdate={(p) => update(a.id, p)} />
        ))}
      </div>

      <section id="tracking" className="scroll-mt-24">
        <Card className="p-5 sm:p-6">
          <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><Target className="size-4" /> Is the action working?</div>
          <p className="mb-4 text-xs text-mute">The programme is working when these measures fall from their {monthShort(month)} baseline. Select a measure to open its trend.</p>
          <div className="grid gap-2 md:grid-cols-2">
            {WATCH.map((id) => {
              const def = kpiById(id)!;
              const d = kpiDelta(model, def, month, null);
              const v = snap[def.key] ?? null;
              const tone = dirTone(def.good, d?.value);
              return (
                <button key={id} onClick={() => openKpi(id)} className="flex w-full items-center justify-between rounded-xl border border-line bg-card px-4 py-3 text-left transition hover:border-ink">
                  <span className="text-[13.5px] font-medium">{def.label}</span>
                  <span className="flex items-center gap-4">
                    <span className="num text-[15px] font-semibold">{formatCompactKpi(def, v)}</span>
                    <span className={cn("num w-20 text-right text-xs font-bold", tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : "text-mute")}>{d ? (d.kind === "pp" ? fmtPp(d.value) : fmtSignedPct(d.value)) : "n/a"}</span>
                    <span className="hidden text-[11px] text-soft sm:block">target: below {pm ? monthShort(pm) : "prior"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      </section>
    </div>
  );
}
