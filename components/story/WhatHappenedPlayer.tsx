"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, MotionConfig, useMotionValue, type Variants } from "motion/react";
import { ArrowRight, Pause, Play, RotateCcw, SkipBack, SkipForward, X, Zap } from "lucide-react";
import { GenieMark } from "../ui/Marks";
import { cn, RichText } from "../ui/primitives";
import { USStoryMap, type MapFrame } from "./USStoryMap";
import { SceneVisualView } from "./SceneVisual";
import type { SceneLayout, StoryScene } from "@/lib/story/types";
import type { MonthKey } from "@/lib/data/types";
import { monthLabel } from "@/lib/format";
import { analysisHref } from "@/lib/story/links";
import { DownloadSlidesButton } from "./SlideExport";
import { HorizonToggle } from "./EvidencePanel";
import { NarrativeBlock } from "./NarrativeList";
import { useApp } from "../AppContext";
import { Modal } from "../ui/Modal";
import { Detail } from "../analysis/DetailedAnalysis";
import { buildSelectionNarrative, selectionLabel } from "@/lib/story/analysis";
import { NO_SELECTION, patchSelection, type Selection, type SelectionPatch } from "@/lib/story/links";
import { EDGE_FADE, Layout, MAP_FRAME, SceneText, frameV, mapStateFor, visualV } from "./SceneFrame";

const ease = [0.22, 0.9, 0.24, 1] as const;
const NARROW_FRAME: MapFrame = { x0: 0.03, x1: 0.97, y0: 0.42, y1: 0.86 };
/** Forward-looking scenes that carry the Next 5 / Next 30 days switch. */
const HORIZON_SCENES = new Set(["sales-prevention", "high-value", "contact-prevention"]);

function useWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/**
 * Full-screen guided briefing that follows the app theme (light or dark). Scenes come from
 * `buildStoryScenes`; each carries a layout so the narration moves around the visual. The map stays
 * mounted for the whole story and its camera animates the SVG viewBox, so it is sharp at any zoom.
 * Autoplay runs on requestAnimationFrame and writes to a motion value: the progress rail animates
 * without re-rendering React.
 */
export function WhatHappenedPlayer({
  scenes, month, onClose, onTakeAction,
}: { scenes: StoryScene[]; month: MonthKey; onClose: () => void; onTakeAction: () => void }) {
  const router = useRouter();
  const { horizon, model } = useApp();
  const [index, setIndex] = useState(0);
  // A state, channel or agency picked in a scene: its Detailed Analysis opens in a dialog and the story pauses.
  const [openSel, setOpenSel] = useState<Selection | null>(null);
  const openDetail = useCallback((p: SelectionPatch) => { setPlaying(false); setOpenSel(patchSelection(NO_SELECTION, p)); }, []);
  const selectState = useCallback((s: string) => openDetail({ states: [s] }), [openDetail]);
  const closeDetail = useCallback(() => setOpenSel(null), []);
  const [playing, setPlaying] = useState(true);
  const [run, setRun] = useState(0);
  const progress = useMotionValue(0);
  const elapsed = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const playBtn = useRef<HTMLButtonElement>(null);
  const scene = scenes[index];
  const last = index === scenes.length - 1;

  // Map: fills from the current (or latest earlier) map scene, zoom once the story reaches it.
  const mapScenes = useMemo(() => scenes.map((s, i) => ({ s, i })).filter((x) => x.s.visual.kind === "map"), [scenes]);
  const { mapStates, zoom, layout: mapLayout, isMapScene, opacity: mapOpacity } = mapStateFor(scenes, index);
  const wide = useWide();
  // On narrow screens the narration stacks above the visual, so the map always sits in the lower stage.
  const frame = wide ? MAP_FRAME[mapLayout] : NARROW_FRAME;

  // ---- timeline
  useEffect(() => {
    elapsed.current = 0;
    progress.set(0);
  }, [index, run, progress]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let prev = performance.now();
    const tick = (t: number) => {
      elapsed.current += t - prev;
      prev = t;
      const p = Math.min(1, elapsed.current / scene.duration);
      progress.set(p);
      if (p >= 1) {
        if (index < scenes.length - 1) setIndex((i) => i + 1);
        else setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, index, run, scene.duration, scenes.length, progress]);

  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(scenes.length - 1, i))), [scenes.length]);
  const next = useCallback(() => go(index + 1), [go, index]);
  const prevScene = useCallback(() => go(index - 1), [go, index]);
  const replay = useCallback(() => {
    setIndex(0);
    setRun((r) => r + 1);
    setPlaying(true);
  }, []);
  const toggle = useCallback(() => {
    if (last && progress.get() >= 1) return replay();
    setPlaying((p) => !p);
  }, [last, progress, replay]);

  // ---- keyboard, focus and scroll lock
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    playBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (openSel) return; // the dialog handles its own keys (Escape closes it, not the story)
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "Escape") return onClose();
      if (e.key === "Tab" && root.current) {
        const f = [...root.current.querySelectorAll<HTMLElement>("button, a[href]")].filter((el) => !el.hasAttribute("disabled"));
        if (!f.length) return;
        const first = f[0], lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
        return;
      }
      if (tag === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
      if (e.key === " " || e.key === "k") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowRight" || e.key === "l") next();
      else if (e.key === "ArrowLeft" || e.key === "j") prevScene();
      else if (e.key === "Home" || e.key === "r") replay();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [onClose, toggle, next, prevScene, replay, openSel]);

  const focusState = mapScenes.map((x) => (x.s.visual.kind === "map" ? x.s.visual.zoom : null)).find(Boolean) ?? null;
  const evidenceHref = focusState ? analysisHref({ state: focusState }, month) : `/cancellations?month=${month}`;
  const endActions = (
    <div className="flex flex-wrap gap-2.5">
      <button onClick={onTakeAction} className="bs-gradient inline-flex h-12 items-center gap-2 rounded-full px-6 text-[14.5px] font-semibold text-white shadow-[0_12px_28px_-12px_rgba(242,106,54,0.9)] transition-transform hover:-translate-y-0.5">
        <Zap className="size-4" /> Take Action
      </button>
      <button onClick={() => { onClose(); router.push(evidenceHref); }} className="inline-flex h-12 items-center gap-2 rounded-full border border-line bg-card px-6 text-[14.5px] font-semibold text-ink shadow-card transition hover:shadow-pop">
        See full evidence <ArrowRight className="size-4" />
      </button>
      <button onClick={replay} className="inline-flex h-12 items-center gap-2 rounded-full px-4 text-[14.5px] font-semibold text-mute transition hover:text-ink">
        <RotateCcw className="size-4" /> Replay story
      </button>
    </div>
  );

  const l = scene.layout;
  const text = (
    <div className="pointer-events-auto">
      <SceneText scene={scene} layout={l} wide={l === "top" || l === "bottom"}
        aside={HORIZON_SCENES.has(scene.id) ? <span onClickCapture={() => setPlaying(false)}><HorizonToggle large /></span> : undefined} />
    </div>
  );
  const visual = (
    <motion.div variants={visualV} className={cn("pointer-events-auto min-h-0 w-full", isMapScene && (l === "top" ? "self-end" : l === "right" ? "self-end" : ""))}>
      {/* Re-keyed on the horizon so the figures replay their entrance when the switch changes them. */}
      <SceneVisualView key={horizon} visual={scene.visual} actions={last ? endActions : undefined} onSelect={openDetail} />
    </motion.div>
  );

  return createPortal(
    <MotionConfig reducedMotion="never">
      <motion.div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label={`What happened, ${monthLabel(month)}`}
        className="fixed inset-0 z-[60] flex flex-col overflow-clip bg-canvas text-ink"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease }}
      >
        {/* ambient light */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 -top-40 size-[720px] rounded-full opacity-70" style={{ background: "radial-gradient(circle, rgba(255,170,110,0.22), transparent 65%)" }} />
          <div className="absolute -right-40 top-10 size-[640px] rounded-full opacity-60" style={{ background: "radial-gradient(circle, rgba(255,214,102,0.16), transparent 65%)" }} />
          <div className="absolute -bottom-60 left-1/3 size-[700px] rounded-full opacity-60" style={{ background: "radial-gradient(circle, rgba(79,199,192,0.10), transparent 65%)" }} />
        </div>

        {/* header */}
        <div className="relative flex items-center justify-between gap-4 px-5 py-4 sm:px-10 sm:py-5">
          <div className="flex items-center gap-3">
            <GenieMark size={34} />
            <div>
              <div className="text-[15px] font-semibold tracking-tight">What happened</div>
              <div className="text-[12px] text-mute">{monthLabel(month)} briefing</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={scene.mode}
                initial={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                className={cn("rounded-full px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em]", scene.mode === "observed" ? "bg-observed-soft text-observed" : "bg-teal-soft text-teal")}
              >
                {scene.mode === "observed" ? "Observed" : "Forward-looking"}
              </motion.span>
            </AnimatePresence>
            <span className="num whitespace-nowrap rounded-full bg-card px-3 py-1.5 text-[12.5px] font-semibold text-mute shadow-card" aria-live="polite">{index + 1} / {scenes.length}</span>
            <DownloadSlidesButton scenes={scenes} month={month} compact onBefore={() => setPlaying(false)} />
            <button onClick={onClose} aria-label="Exit briefing (Escape)" className="grid size-10 place-items-center rounded-full bg-card text-mute shadow-card transition hover:text-ink hover:shadow-pop"><X className="size-4" /></button>
          </div>
        </div>

        {/* stage */}
        <div className="relative min-h-0 flex-1">
          <motion.div
            aria-hidden={!isMapScene}
            className={cn("absolute inset-0", !isMapScene && "pointer-events-none")}
            style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE, maskComposite: "intersect", WebkitMaskComposite: "source-in" }}
            initial={false}
            animate={{ opacity: mapOpacity }}
            transition={{ duration: 0.9, ease }}
          >
            <USStoryMap key={run} states={mapStates} zoom={zoom} frame={frame} showLabels={isMapScene} onSelect={isMapScene ? selectState : undefined} />
          </motion.div>

          {/* On map scenes only the narration and visual take clicks; the rest reaches the map underneath. */}
          <div className={cn("relative h-full", isMapScene && "pointer-events-none")}>
            <AnimatePresence custom={l}>
              <motion.div
                key={`${scene.id}-${run}`}
                custom={l}
                variants={frameV}
                initial="initial"
                animate="enter"
                exit="exit"
                className={cn("absolute inset-0 overflow-y-auto px-5 pb-4 sm:px-10 lg:overflow-hidden", isMapScene && "pointer-events-none")}
              >
                <Layout layout={l} text={text} visual={visual} map={isMapScene} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* progress rail and controls */}
        <div className="relative px-5 pb-5 pt-3 sm:px-10">
          <div className="flex gap-1.5" role="tablist" aria-label="Story scenes">
            {scenes.map((s, i) => (
              <button key={s.id} role="tab" aria-selected={i === index} aria-label={`Scene ${i + 1}: ${s.title}`} title={s.kicker} onClick={() => go(i)} className="group relative h-6 flex-1">
                <span className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 overflow-hidden rounded-full bg-line transition-colors group-hover:bg-soft/50">
                  {i < index && <span className={cn("absolute inset-0", s.mode === "observed" ? "bg-ink/80" : "bg-teal")} />}
                  {i === index && <motion.span className={cn("absolute inset-0 origin-left", s.mode === "observed" ? "bg-ink" : "bg-teal")} style={{ scaleX: progress }} />}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <CtrlButton label="Previous scene (Left arrow)" onClick={prevScene} disabled={index === 0}><SkipBack className="size-4" /></CtrlButton>
              <button
                ref={playBtn}
                onClick={toggle}
                aria-label={playing ? "Pause (Space)" : "Play (Space)"}
                className="grid size-12 place-items-center rounded-full bg-ink text-canvas shadow-pop transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 translate-x-[1px] fill-current" />}
              </button>
              <CtrlButton label="Next scene (Right arrow)" onClick={next} disabled={last}><SkipForward className="size-4" /></CtrlButton>
              <CtrlButton label="Replay from the start" onClick={replay}><RotateCcw className="size-4" /></CtrlButton>
            </div>
            <div className="hidden text-[12px] text-mute sm:block">Space play or pause · Arrows move between scenes · Esc exits</div>
          </div>
        </div>

        <Modal
          open={!!openSel}
          onClose={closeDetail}
          header={
            <div className="flex flex-wrap items-end justify-between gap-3 px-6 py-5 pr-16">
              <div>
                <div className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-mute">Detailed Analysis · {monthLabel(month)}</div>
                <div className="mt-1 text-[24px] font-semibold tracking-tight">{openSel && (openSel.rep ? `Representative ${openSel.rep}` : selectionLabel(model, openSel))}</div>
              </div>
              {openSel && (
                <button onClick={() => { onClose(); router.push(analysisHref(openSel, month)); }} className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-card px-4 text-[13px] font-semibold text-ink shadow-card transition hover:shadow-pop">
                  Open in Detailed Analysis <ArrowRight className="size-4" />
                </button>
              )}
            </div>
          }
        >
          {openSel && <DetailAnalysis sel={openSel} month={month} select={(p) => setOpenSel((s) => patchSelection(s ?? NO_SELECTION, p))} />}
        </Modal>
      </motion.div>
    </MotionConfig>,
    document.body,
  );
}

/**
 * The same insights and detail the Detailed Analysis tab shows for a selection (a state, a channel in a state,
 * or an agency with its representatives). Picks inside (an agency, a rep) refine the dialog in place.
 */
function DetailAnalysis({ sel, month, select }: { sel: Selection; month: MonthKey; select: (p: SelectionPatch) => void }) {
  const { model } = useApp();
  const top = useRef<HTMLDivElement>(null);
  const key = `${sel.states}|${sel.channels}|${sel.agencies}|${sel.rep}|${month}`;
  const points = useMemo(() => buildSelectionNarrative(model, month, sel), [model, month, sel]);
  useEffect(() => { top.current?.closest(".overflow-y-auto")?.scrollTo({ top: 0, behavior: "smooth" }); }, [key]);
  return (
    <div ref={top} className="space-y-6">
      <NarrativeBlock points={points} resetKey={key} eyebrow={selectionLabel(model, sel)} />
      <Detail sel={sel} select={select} />
    </div>
  );
}

function CtrlButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-11 place-items-center rounded-full text-mute transition hover:bg-card hover:text-ink hover:shadow-card disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:shadow-none focus-visible:outline-2 focus-visible:outline-brand"
    >
      {children}
    </button>
  );
}
