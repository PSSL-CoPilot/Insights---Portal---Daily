"use client";

import { AlertOctagon, Clock, HandHelping, PackageCheck, PhoneCall, Route } from "lucide-react";
import { PageInsights } from "../story/PageInsights";
import { useApp } from "../AppContext";
import { Badge, Card, cn, SectionTitle } from "../ui/primitives";
import { Reveal } from "../ui/Reveal";
import { C } from "../charts/shared";
import { getSnapshot } from "@/lib/data/metrics";
import { fmtCompact, fmtDate, fmtInt, fmtPct, fmtPct0, monthLabel } from "@/lib/format";
import type { JourneyStep } from "@/lib/data/types";

const INTERVENE = /offer|sms|call|outreach|escalat|rescue|confirm|rebook/i;
const FINAL = /cancel|failure/i;

function riskTone(step: JourneyStep): "bad" | "warn" | "good" | "neutral" {
  const t = `${step.risk} ${step.status}`.toLowerCase();
  if (/final|very high|high cancel|post odd/.test(t)) return "bad";
  if (/weak|early|pending|customer request|no access/.test(t)) return "warn";
  if (/normal|no operational|proceed|no action needed|commitment/.test(t)) return "good";
  return "neutral";
}

const dotClass = { bad: "bg-bad", warn: "bg-warn", good: "bg-good", neutral: "bg-slate-soft" } as const;

export function JourneyPage() {
  const { model, month } = useApp();
  const s = getSnapshot(model, month, null);
  const steps = model.journey;
  const dates = steps.map((x) => x.date).filter((d): d is string => !!d).sort();
  const days = dates.length > 1 ? Math.round((+new Date(dates[dates.length - 1]) - +new Date(dates[0])) / 86400000) : null;
  const chances = steps.filter((x) => INTERVENE.test(x.action) && !FINAL.test(x.event)).length;

  const lifecycle = [
    { label: "Order placed", n: s.sales, sub: "Unique Sales", color: C.ink },
    { label: "Before ODD", n: s.preCancels, sub: "Pre ODD cancels", color: C.slate },
    { label: "On ODD", n: s.onCancels, sub: "On ODD cancels", color: C.lilac },
    { label: "After ODD", n: s.postCancels, sub: "Post ODD cancels", color: C.indigo, hot: true },
    { label: "Installed", n: s.installs, sub: "Installs", color: C.good },
  ];

  return (
    <div className="space-y-10">
      <SectionTitle eyebrow={`Sales → Install journey · ${monthLabel(month)}`} title="Where in the lifecycle are we losing customers?" sub="From order to install, cancellations can happen before, on, or after the Original Due Date." />
      <PageInsights page="journey" scope={null} />

      <Card className="p-5 sm:p-7">
        <div className="grid gap-3 md:grid-cols-5">
          {lifecycle.map((l, i) => (
            <Reveal key={l.label} delay={i * 80}>
              <div className={cn("relative h-full rounded-2xl border p-4", l.hot ? "border-ink bg-panel text-white" : "border-line bg-subtle")}>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: l.hot ? "#FFC72C" : undefined }}>
                  <span className="size-2.5 rounded-full" style={{ background: l.color }} />{l.label}
                </div>
                <div className="num-display mt-3 text-[30px] leading-none">{fmtCompact(l.n)}</div>
                <div className={cn("mt-1 text-xs", l.hot ? "text-white/60" : "text-mute")}>{l.sub}</div>
                {l.label !== "Order placed" && s.sales ? <div className={cn("num mt-2 text-xs font-semibold", l.hot ? "text-brand" : "text-mute")}>{fmtPct((l.n ?? 0) / s.sales)} of sales</div> : null}
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-4 text-[13px] text-mute">
          {s.cancels !== null && s.sales ? <>Cancellations equal <strong className="text-ink">{fmtPct(s.cancels / s.sales)}</strong> of sales; <strong className="text-ink">{fmtPct0(s.postPct)}</strong> of them happen after the ODD, and installs convert {fmtPct((s.installs ?? 0) / (s.sales || 1))} of sales in the month.</> : null}
        </p>
      </Card>

      <section>
        <SectionTitle eyebrow="Example customer journey" title="One order, start to cancellation" sub="A representative North Carolina D2D order. Follow it step by step to see where Brightspeed could have intervened." />
        <div className="mt-6 flex flex-wrap gap-3">
          <Chip icon={<Route className="size-4" />} label="Steps" value={String(steps.length)} />
          {days !== null && <Chip icon={<Clock className="size-4" />} label="Order to cancel" value={`${days} days`} />}
          <Chip icon={<HandHelping className="size-4" />} label="Moments to intervene" value={String(chances)} tone="warn" />
        </div>

        <ol className="relative mt-8 space-y-2 pl-2 sm:pl-6">
          <div className="absolute bottom-6 left-[19px] top-6 w-px bg-gradient-to-b from-line via-line to-bad sm:left-[43px]" />
          {steps.map((st, i) => {
            const tone = riskTone(st);
            const intervene = INTERVENE.test(st.action) && !FINAL.test(st.event);
            const last = i === steps.length - 1;
            return (
              <Reveal as="li" key={st.step} delay={40} className="relative grid grid-cols-[38px_1fr] gap-4 sm:grid-cols-[76px_1fr] sm:gap-6">
                <div className="relative flex flex-col items-center pt-4">
                  <span className={cn("relative z-10 grid size-[22px] place-items-center rounded-full ring-4 ring-canvas", dotClass[tone], last && "animate-pulse-ring")}>
                    {last ? <AlertOctagon className="size-3 text-white" /> : st.step === 1 ? <PackageCheck className="size-3 text-white" /> : intervene ? <PhoneCall className="size-3 text-white" /> : null}
                  </span>
                  <span className="num mt-1.5 hidden text-[11px] font-semibold text-mute sm:block">{fmtDate(st.date)}</span>
                </div>
                <div className={cn("rounded-[22px] border bg-card p-4 shadow-card transition hover:shadow-pop sm:p-5", last && "border-bad/40 bg-bad-soft")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num text-xs font-semibold text-mute sm:hidden">{fmtDate(st.date)}</span>
                    <span className="eyebrow">Step {st.step}</span>
                    {st.status && <Badge tone={tone === "bad" ? "bad" : tone === "warn" ? "warn" : tone === "good" ? "good" : "neutral"}>{st.status}</Badge>}
                    {intervene && <Badge tone="brand" className="ml-auto"><HandHelping className="size-3" /> Opportunity to intervene</Badge>}
                  </div>
                  <h4 className="mt-2 text-[17px] font-semibold leading-snug">{st.event}</h4>
                  <div className="mt-2 grid gap-x-8 gap-y-1 text-[13px] sm:grid-cols-2">
                    {st.risk && <div><span className="text-mute">Risk: </span><span className={cn("font-semibold", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "")}>{st.risk}</span></div>}
                    {st.action && <div><span className="text-mute">Recommended: </span><span className="font-semibold">{st.action}</span></div>}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function Chip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "warn" }) {
  return (
    <div className={cn("flex items-center gap-2.5 rounded-full border bg-card px-4 py-2 text-[13px] shadow-card", tone === "warn" ? "border-warn/40" : "border-line")}>
      <span className="text-mute">{icon}</span>
      <span className="text-mute">{label}</span>
      <strong className="num">{value}</strong>
    </div>
  );
}
