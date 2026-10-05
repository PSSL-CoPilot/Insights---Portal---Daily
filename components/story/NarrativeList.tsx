"use client";

import { useEffect, useId, useState } from "react";
import { motion } from "motion/react";
import { Card, cn, RichText } from "../ui/primitives";
import { EvidencePanel, EvidenceToggle } from "./EvidencePanel";
import type { NarrativePoint, StoryMode } from "@/lib/story/types";

export function ModeTag({ mode, className }: { mode: StoryMode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-[1px] text-[9.5px] font-bold uppercase leading-4 tracking-[0.1em]",
        mode === "observed" ? "bg-observed-soft text-observed" : "bg-teal-soft text-teal",
        className,
      )}
    >
      {mode === "observed" ? "Observed" : "Forward-looking"}
    </span>
  );
}

const ease = [0.2, 0.8, 0.2, 1] as const;

/**
 * Ordered story points. Each point can open one inline evidence panel; opening another closes
 * the first so the summary stays compact. Observed points use the neutral rail, forward-looking
 * points the teal one, in story order (never split into two halves).
 */
export function NarrativeList({ points, resetKey, className }: { points: NarrativePoint[]; resetKey?: string; className?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const uid = useId();
  useEffect(() => setOpen(null), [resetKey]);

  return (
    <ol className={cn("relative space-y-0", className)}>
      {points.map((p, i) => {
        const panelId = `${uid}-ev-${p.id}`;
        const isOpen = open === p.id;
        const last = i === points.length - 1;
        return (
          <motion.li
            key={`${resetKey}-${p.id}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease, delay: 0.08 + i * 0.07 }}
            className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0"
          >
            {/* rail */}
            {!last && <span aria-hidden className={cn("absolute left-[13px] top-7 bottom-0 w-px", points[i + 1].mode === "preventive" ? "bg-teal/35" : "bg-line")} />}
            <span
              aria-hidden
              className={cn(
                "relative z-[1] mt-0.5 grid size-7 place-items-center rounded-full text-[11.5px] font-bold",
                p.mode === "preventive" ? "bg-teal text-white dark:text-[#0e0f11]" : p.tone === "bad" ? "bg-panel text-white" : "bg-line-2 text-ink",
              )}
            >
              {i + 1}
            </span>
            <div className={cn("min-w-0", p.mode === "preventive" && "-mx-1 rounded-[18px] border border-teal/20 bg-teal-soft/45 px-4 py-3")}>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <ModeTag mode={p.mode} />
                <span className={cn("text-[11.5px] font-semibold uppercase tracking-[0.08em]", p.mode === "preventive" ? "text-teal" : "text-mute")}>{p.label}</span>
              </div>
              <p className="text-[15px] leading-[1.62] text-ink-2">
                <RichText text={p.text} />
                {p.evidence && <EvidenceToggle open={isOpen} controls={panelId} onToggle={() => setOpen(isOpen ? null : p.id)} className={p.mode === "preventive" && !isOpen ? "hover:border-teal hover:text-teal" : undefined} />}
              </p>
              {p.evidence && <EvidencePanel spec={p.evidence} open={isOpen} id={panelId} />}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

/** "What is happening?" block for the plan overview and each state or channel plan. */
export function NarrativeBlock({ points, resetKey, eyebrow, title = "What is happening?" }: { points: NarrativePoint[]; resetKey: string; eyebrow?: string; title?: string }) {
  if (!points.length) return null;
  return (
    <Card className="relative overflow-clip p-5 sm:p-7">
      <div className="glow pointer-events-none absolute -right-40 -top-40 size-[26rem] opacity-30" />
      <div className="relative">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h3 className="mb-5 text-[21px] font-semibold tracking-tight">{title}</h3>
        <NarrativeList points={points} resetKey={resetKey} />
      </div>
    </Card>
  );
}
