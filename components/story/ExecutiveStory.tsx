"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowDown, ArrowRight, Play, Zap } from "lucide-react";
import { GenieMark } from "../ui/Marks";
import { useApp } from "../AppContext";
import { firstName, useProfile } from "../profile";
import { Badge, Card, RichText } from "../ui/primitives";
import { Sparkline } from "../ui/Sparkline";
import { NarrativeList } from "./NarrativeList";
import { ActionsDrawer } from "./ActionsDrawer";
import { DownloadSlidesButton } from "./SlideExport";
import { HorizonToggle } from "./EvidencePanel";
import { buildExecutiveNarrative } from "@/lib/story/narrative";
import { buildStoryScenes } from "@/lib/story/scenes";
import { storyFacts } from "@/lib/story/facts";
import { series } from "@/lib/data/metrics";
import { fmtCompact, fmtPct, fmtPp, fmtSignedPct, monthLabel, monthName, monthShort } from "@/lib/format";

// The player (and its map geometry) loads only when someone presses Play.
const WhatHappenedPlayer = dynamic(() => import("./WhatHappenedPlayer").then((m) => m.WhatHappenedPlayer), { ssr: false });

const BAD = "var(--color-bad)";
const GOOD = "var(--color-good)";

/** Command Center executive story: insight first, evidence on demand, then action. */
export function ExecutiveStory() {
  const { model, month, horizon } = useApp();
  const story = useMemo(() => buildExecutiveNarrative(model, month), [model, month]);
  // Forward-looking panel: next 5 or 30 days from the selected end date (the same engine as the outlook and actions).
  const outlook = model.daily?.outlook?.[horizon] ?? null;
  const scenes = useMemo(() => buildStoryScenes(model, month), [model, month]);
  const f = storyFacts(model, month);
  const profile = useProfile();
  const [playing, setPlaying] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const closePlayer = useCallback(() => setPlaying(false), []);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const takeAction = useCallback(() => {
    setPlaying(false);
    setDrawer(true);
  }, []);

  const cancelSeries = series(model, "cancels", null).filter((p) => p.month <= month).map((p) => p.value);
  const salesSeries = series(model, "sales", null).filter((p) => p.month <= month).map((p) => p.value);
  const up = (f.d.cancelsMoM ?? 0) > 0;

  return (
    <section aria-labelledby="exec-summary">
      <Card className="warm-wash relative overflow-clip">
        <div className="relative grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,26%)]">
          <div className="@container min-w-0 p-6 sm:p-9 xl:px-11">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <GenieMark size={30} />
                <span className="eyebrow">{story.eyebrow}</span>
                <Badge>{monthLabel(month)}</Badge>
                {story.status && <Badge tone={story.status.tone === "bad" ? "bad" : "good"}>{story.status.label}</Badge>}
              </div>
              {scenes.length > 1 && (
                <div className="flex items-center gap-2">
                <DownloadSlidesButton scenes={scenes} month={month} />
                <button
                  onClick={() => setPlaying(true)}
                  className="group inline-flex h-11 items-center gap-2.5 rounded-full bg-panel pl-1.5 pr-5 text-[13.5px] font-semibold text-white shadow-pop transition-transform duration-300 hover:-translate-y-0.5"
                  aria-haspopup="dialog"
                >
                  <span className="bs-gradient grid size-8 place-items-center rounded-full text-white"><Play className="size-3.5 translate-x-[1px] fill-current" /></span>
                  Play What Happened
                </button>
                </div>
              )}
            </div>

            {/* One line: the font shrinks with the sentence length (about half an em per character). */}
            <h2 id="exec-summary" className="mt-6 text-[26px] font-medium leading-[1.12] tracking-[-0.03em] sm:whitespace-nowrap sm:text-[length:var(--hl)]"
              style={{ ["--hl" as string]: `min(42px, ${(212 / Math.max(40, story.headline.replace(/\{\{\w+:([^}]*)\}\}/g, "$1").length)).toFixed(2)}cqw)` }}>
              <span className="bs-gradient-text block pb-1">Hey {firstName(profile.name) || "there"},</span>
              <RichText text={story.headline} />
            </h2>
            {story.subhead && <p className="mt-3 max-w-3xl text-[17px] leading-relaxed text-ink-2 sm:text-[19px]">{story.subhead}</p>}

            <NarrativeList points={story.points} resetKey={month} className="mt-8" />

            <div className="mt-9 flex flex-wrap items-center gap-3 border-t border-line/80 pt-6">
              <button
                onClick={() => setDrawer(true)}
                className="bs-gradient group inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white shadow-[0_12px_28px_-12px_rgba(242,106,54,0.9)] transition-transform duration-300 hover:-translate-y-0.5"
                aria-haspopup="dialog"
              >
                <Zap className="size-4" /> Take Action
              </button>
              <Link href={`/actions?month=${month}`} className="group inline-flex h-12 items-center gap-2 rounded-full border border-line bg-card px-5 text-[14px] font-semibold transition hover:shadow-pop">
                Open full Action Center <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <button onClick={() => document.getElementById("kpis")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="inline-flex h-12 items-center gap-1.5 px-2 text-[13px] font-semibold text-mute transition hover:text-ink">
                KPI command center <ArrowDown className="size-3.5" />
              </button>
            </div>
          </div>

          {/* headline numbers */}
          <aside className="relative m-3 rounded-[22px] border border-line bg-card p-6 shadow-card sm:p-7 lg:ml-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{monthName(month)} vs {f.prev ? monthName(f.prev) : "prior period"}</div>
            {f.prev ? (
              <div className="mt-5 space-y-6 lg:sticky lg:top-28">
                <Stat label="Cancellations" value={fmtSignedPct(f.d.cancelsMoM)} color={up ? BAD : GOOD} sub={`${fmtCompact(f.port.cancels)} orders · cancel rate ${fmtPct(f.port.cancelRate)}`} spark={cancelSeries} big />
                <div className="h-px bg-line" />
                <Stat label="Unique Sales" value={fmtSignedPct(f.d.salesMoM)} color={(f.d.salesMoM ?? 0) >= 0 ? GOOD : BAD} sub={`${fmtCompact(f.port.sales)} sales`} spark={salesSeries} />
                {outlook && (
                  <>
                    <div className="h-px bg-line" />
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-full bg-teal-soft px-2 py-[1px] text-[9.5px] font-bold uppercase tracking-[0.1em] text-teal">Forward-looking</span>
                        <HorizonToggle />
                      </div>
                      <div className="mt-1.5 text-[12px] text-mute">{monthShort(outlook.from)} to {monthShort(outlook.to)}, from the selected date</div>
                      <div className="mt-2.5 flex items-baseline gap-2">
                        <span className="num-display text-[30px] leading-none text-bad">{fmtPct(outlook.rateNo)}</span>
                        <ArrowRight className="size-4 text-soft" />
                        <span className="num-display text-[30px] leading-none text-teal">{fmtPct(outlook.rateWith)}</span>
                      </div>
                      <div className="mt-1.5 text-[12px] text-mute">No action vs the three actions · about {outlook.avoided.toLocaleString("en-US")} cancellations avoided</div>
                    </div>
                  </>
                )}
                {f.d.anomaly && f.baselineRate !== null && f.port.cancelRate !== null && (
                  <div className="rounded-2xl bg-card px-4 py-3 text-[13px] leading-snug text-ink-2 shadow-card">
                    {(f.d.cancelsMoM ?? 0) > 0.02 && (f.d.salesMoM ?? 0) > 0.005 && (f.d.cancelsMoM ?? 0) / (f.d.salesMoM ?? 1) >= 1.5
                      ? <>Cancellations are growing <strong className="bs-gradient-text">{((f.d.cancelsMoM ?? 0) / (f.d.salesMoM ?? 1)).toFixed(0)}×</strong> faster than sales.</>
                      : <>The cancel rate is <strong className="bs-gradient-text">{fmtPp(f.port.cancelRate - f.baselineRate)}</strong> above the {fmtPct(f.baselineRate)} norm.</>}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-5 text-sm text-mute">No earlier period is available for comparison.</p>
            )}
          </aside>
        </div>
      </Card>

      <ActionsDrawer open={drawer} onClose={closeDrawer} />
      {playing && <WhatHappenedPlayer scenes={scenes} month={month} onClose={closePlayer} onTakeAction={takeAction} />}
    </section>
  );
}

function Stat({ label, value, color, sub, spark, big }: { label: string; value: string; color: string; sub: string; spark: (number | null)[]; big?: boolean }) {
  return (
    <div>
      <div className="text-[13px] text-mute">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div>
          <div className={big ? "num-display text-[58px] leading-none" : "num-display text-[42px] leading-none"} style={{ color }}>{value}</div>
          <div className="mt-2 text-[12.5px] text-mute">{sub}</div>
        </div>
        <Sparkline values={spark} color={color} width={104} height={big ? 48 : 40} />
      </div>
    </div>
  );
}
