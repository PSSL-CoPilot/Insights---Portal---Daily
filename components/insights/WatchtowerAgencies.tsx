"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { useApp } from "../AppContext";
import { Card, cn } from "../ui/primitives";
import { Donut } from "../charts/Donut";
import { AgencyTable, RepTable } from "../analysis/AgencyViews";
import { bandColor } from "../analysis/charts";
import { analysisHref } from "@/lib/story/links";
import { AGENCY_GAP_THRESHOLD } from "@/lib/data/metrics";
import { fmtInt, fmtPct, fmtPct0, fmtPp, monthLabel } from "@/lib/format";

const BANDS = ["Critical", "High", "Watch", "Low"] as const;

/** Watchtower bands for every partner agency and representative (the agency and rep data comes from Watchtower). */
export function WatchtowerAgencies() {
  const { model, month } = useApp();
  const router = useRouter();
  const st = model.story;
  const active = useMemo(() => st.reps.filter((r) => (r.sales ?? 0) > 0), [st.reps]);
  const worst = useMemo(() => [...st.agencies].sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))[0]?.agency ?? null, [st.agencies]);
  const [agency, setAgency] = useState<string | null>(null);
  const sel = agency ?? worst;
  if (!st.agencies.length || !active.length) return null;

  const counts = BANDS.map((b) => ({ band: b, n: active.filter((r) => r.band.toLowerCase() === b.toLowerCase()).length }));
  const a = st.agencies.find((x) => x.agency === sel) ?? null;
  const reps = active.filter((r) => r.agency === sel);
  const crit = reps.filter((r) => /critical/i.test(r.band)).length;
  const watchMonth = model.watchMonth ?? month;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">Agency and representative watch · {st.focusState} · {monthLabel(watchMonth)}</div>
          <h3 className="text-[19px] font-semibold tracking-tight">Which partners and reps does Watchtower flag?</h3>
          <p className="mt-0.5 max-w-3xl text-[13px] text-mute">Every partner agency and representative with its Watchtower band. Select an agency to see its representatives; select a representative to open its full analysis.</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.8fr)_2fr]">
        <Card className="p-5 sm:p-6">
          <div className="text-[15px] font-semibold">Representatives by Watchtower band</div>
          <div className="mt-1 text-[12px] text-mute">{fmtInt(active.length)} active partner representatives · Low ≤15%, Watch ≤25%, High ≤40%, Critical above</div>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            <Donut
              size={160}
              thickness={20}
              data={counts.filter((c) => c.n > 0).map((c) => ({ name: c.band, value: c.n, color: bandColor(c.band), detail: `${c.n} reps` }))}
              center={<div><div className="num-display text-[30px] leading-none">{counts[0].n}</div><div className="mt-1 text-[10.5px] text-mute">Critical</div></div>}
            />
            <ul className="min-w-[120px] flex-1 space-y-2 text-[13px]">
              {counts.map((c) => (
                <li key={c.band} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2"><span className="h-2.5 w-5 rounded-full" style={{ background: bandColor(c.band) }} />{c.band}</span>
                  <span className="num font-semibold">{c.n}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
        <AgencyTable agencies={st.agencies} selected={sel} select={(s) => s.agency && setAgency(s.agency)} title="Agencies against their own history" sub="Cancel rate vs each agency's own January to August history. Select an agency." />
      </div>

      {a && (
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[16px] font-semibold">
                {(a.gap ?? 0) >= AGENCY_GAP_THRESHOLD && <ShieldAlert className="size-4 text-bad" />}
                {a.agency} · {a.channel}
              </div>
              <p className="mt-1 text-[13px] text-mute">
                Cancel rate <strong className={cn((a.gap ?? 0) >= AGENCY_GAP_THRESHOLD ? "text-bad" : "text-ink")}>{fmtPct(a.cancelRate)}</strong> vs own history {fmtPct(a.baseline)} ({fmtPp(a.gap)}).{" "}
                {reps.length ? <><strong className="text-ink">{crit} of {reps.length}</strong> representatives are Critical. </> : null}
                {a.lowIntent !== null && <>Low intent {fmtPct0(a.lowIntent)}, failed confirmation {fmtPct0(a.failedConfirm)}.</>}
              </p>
            </div>
            <Link href={analysisHref({ agency: a.agency }, month)} className="group inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-card px-4 text-[13px] font-semibold transition hover:shadow-pop">
              Open {a.agency} analysis <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {reps.length ? (
            <RepTable reps={reps} select={(s) => s.rep && router.push(analysisHref({ rep: s.rep }, month))} />
          ) : (
            <p className="text-[13px] text-mute">Representative detail is recorded for partner agencies only.</p>
          )}
        </Card>
      )}
    </section>
  );
}
