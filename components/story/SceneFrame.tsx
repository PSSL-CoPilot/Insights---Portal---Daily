"use client";

import type { ReactNode } from "react";
import { motion, type Variants } from "motion/react";
import { cn, RichText } from "../ui/primitives";
import type { MapFrame } from "./USStoryMap";
import type { SceneLayout, StoryScene } from "@/lib/story/types";

/** Shared by the player and the slide export: scene layouts, narration and map framing. */
export const ease = [0.22, 0.9, 0.24, 1] as const;

export const EDGE_FADE = "linear-gradient(to bottom, transparent 0%, #000 7%, #000 90%, transparent 100%), linear-gradient(to right, transparent 0%, #000 4%, #000 96%, transparent 100%)";

/** Where the map subject sits for each narration layout (fractions of the stage). */
export const MAP_FRAME: Record<SceneLayout, MapFrame> = {
  top: { x0: 0.06, x1: 0.94, y0: 0.27, y1: 0.86 },
  bottom: { x0: 0.06, x1: 0.94, y0: 0.03, y1: 0.64 },
  right: { x0: 0.02, x1: 0.58, y0: 0.06, y1: 0.92 },
  left: { x0: 0.42, x1: 0.98, y0: 0.06, y1: 0.92 },
};

/** Entry direction of the narration for each layout; exits drift the other way. All with motion blur. */
/** Entry direction of the narration for each layout; exits drift the other way. All with motion blur. */
const OFFSET: Record<SceneLayout, { x: number; y: number }> = {
  top: { x: 0, y: -28 },
  bottom: { x: 0, y: 28 },
  right: { x: 36, y: 0 },
  left: { x: -36, y: 0 },
};

export const frameV: Variants = {
  enter: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } },
  exit: { transition: { staggerChildren: 0.04, staggerDirection: -1 } },
};
export const textV: Variants = {
  initial: (l: SceneLayout) => ({ opacity: 0, x: OFFSET[l].x, y: OFFSET[l].y, filter: "blur(10px)" }),
  enter: { opacity: 1, x: 0, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease } },
  exit: (l: SceneLayout) => ({ opacity: 0, x: -OFFSET[l].x * 0.5, y: -OFFSET[l].y * 0.5, filter: "blur(10px)", transition: { duration: 0.35, ease: [0.4, 0, 1, 1] } }),
};
export const visualV: Variants = {
  initial: { opacity: 0, scale: 0.965, y: 18, filter: "blur(8px)" },
  enter: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.75, ease } },
  exit: { opacity: 0, scale: 0.985, y: -10, filter: "blur(10px)", transition: { duration: 0.35, ease: [0.4, 0, 1, 1] } },
};

/** Map state for scene `index`: fills and zoom from the current (or latest earlier) map scene. */
export function mapStateFor(scenes: StoryScene[], index: number) {
  const maps = scenes.map((s, i) => ({ s, i })).filter((x) => x.s.visual.kind === "map");
  const active = [...maps].reverse().find((x) => x.i <= index) ?? maps[0];
  const v = active?.s.visual.kind === "map" ? active.s.visual : null;
  const scene = scenes[index];
  const isMapScene = scene.visual.kind === "map";
  return {
    mapStates: v?.states ?? [],
    zoom: v?.zoom ?? null,
    layout: (active?.s.layout ?? "top") as SceneLayout,
    isMapScene,
    opacity: isMapScene ? 1 : scene.mode === "preventive" ? 0.05 : 0.08,
  };
}

/** Arranges narration and visual for a layout. Text is never pinned to one side for the whole story. */
export function Layout({ layout, text, visual, map }: { layout: SceneLayout; text: ReactNode; visual: ReactNode; map: boolean }) {
  if (layout === "top")
    return (
      <div className="flex h-full flex-col gap-6 pt-2 lg:gap-8">
        {text}
        <div className={cn("flex min-h-0 flex-1 justify-center", map ? "items-end pb-2" : "items-center")}><div className="w-full max-w-[1180px]">{visual}</div></div>
      </div>
    );
  if (layout === "bottom")
    return (
      <div className="flex h-full flex-col gap-6 lg:gap-8">
        <div className="flex min-h-0 flex-1 items-center justify-center pt-2"><div className="w-full max-w-[1180px]">{visual}</div></div>
        {text}
      </div>
    );
  return (
    <div className={cn("grid h-full items-center gap-8 lg:gap-14", layout === "right" ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.85fr)]" : "lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.5fr)]")}>
      {layout === "right" ? (
        <>
          <div className={cn("order-2 flex h-full min-h-0 lg:order-1", map ? "items-end pb-4" : "items-center")}>{visual}</div>
          <div className="order-1 lg:order-2">{text}</div>
        </>
      ) : (
        <>
          <div>{text}</div>
          <div className="flex h-full min-h-0 items-center">{visual}</div>
        </>
      )}
    </div>
  );
}

export function SceneText({ scene, layout, wide }: { scene: StoryScene; layout: SceneLayout; wide: boolean }) {
  const chip = (
    <motion.div variants={textV} custom={layout} className="flex items-center gap-2.5">
      <span className={cn("h-[3px] w-8 rounded-full", scene.mode === "observed" ? "bs-gradient" : "bg-teal")} />
      <span className={cn("text-[12px] font-semibold uppercase tracking-[0.16em]", scene.mode === "observed" ? "text-brand-2" : "text-teal")}>{scene.kicker}</span>
    </motion.div>
  );
  const title = (
    <motion.h2 variants={textV} custom={layout} className="mt-3 text-balance text-[32px] font-medium leading-[1.06] tracking-[-0.035em] sm:text-[46px]">
      <RichText text={scene.title} />
    </motion.h2>
  );
  const body = (
    <motion.p variants={textV} custom={layout} className="max-w-[56ch] text-pretty text-[16.5px] leading-[1.65] text-ink-2 sm:text-[18px] [&_strong]:font-semibold [&_strong]:text-ink">
      <RichText text={scene.body} />
    </motion.p>
  );
  if (wide)
    return (
      <div className="grid items-end gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14">
        <div>{chip}{title}</div>
        {body}
      </div>
    );
  return (
    <div className={cn(layout === "right" && "lg:text-left")}>
      {chip}
      {title}
      <div className="mt-5">{body}</div>
    </div>
  );
}

