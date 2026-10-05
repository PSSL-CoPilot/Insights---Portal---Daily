"use client";

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, MotionConfig, MotionGlobalConfig } from "motion/react";
import { Download, Loader2 } from "lucide-react";
import { GenieMark } from "../ui/Marks";
import { cn, plainText } from "../ui/primitives";
import { USStoryMap } from "./USStoryMap";
import { StaticCharts } from "../charts/Donut";
import { SceneVisualView } from "./SceneVisual";
import { EDGE_FADE, Layout, MAP_FRAME, SceneText, mapStateFor } from "./SceneFrame";
import type { StoryScene } from "@/lib/story/types";
import type { MonthKey } from "@/lib/data/types";
import { monthLabel } from "@/lib/format";

const W = 1600, H = 900;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Draws the SVG snapshot onto a canvas and returns a JPEG (about a quarter of a PNG's size, no visible
 * loss at slide size). Uses image load events only, never animation frames, so a background tab works.
 */
function rasterize(svgUrl: string, ratio: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(W * ratio);
      canvas.height = Math.round(H * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--color-canvas") || "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => reject(new Error("A slide could not be drawn."));
    img.src = svgUrl;
  });
}

/** One briefing scene drawn as a 16:9 slide, exactly as the player shows it (final animation state). */
function Slide({ scenes, index, month, onMapReady }: { scenes: StoryScene[]; index: number; month: MonthKey; onMapReady: () => void }) {
  const scene = scenes[index];
  const m = mapStateFor(scenes, index);
  const wide = scene.layout === "top" || scene.layout === "bottom";
  return (
    <div style={{ width: W, height: H }} className="relative flex flex-col overflow-hidden bg-canvas text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 size-[720px] rounded-full opacity-70" style={{ background: "radial-gradient(circle, rgba(255,170,110,0.22), transparent 65%)" }} />
        <div className="absolute -right-40 top-10 size-[640px] rounded-full opacity-60" style={{ background: "radial-gradient(circle, rgba(255,214,102,0.16), transparent 65%)" }} />
      </div>
      <div className="relative flex items-center justify-between px-12 pt-8">
        <div className="flex items-center gap-3">
          <GenieMark size={36} />
          <div>
            <div className="text-[16px] font-semibold tracking-tight">What happened</div>
            <div className="text-[12.5px] text-mute">{monthLabel(month)} briefing · Brightspeed Cancellation Intelligence</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em]", scene.mode === "observed" ? "bg-observed-soft text-observed" : "bg-teal-soft text-teal")}>
            {scene.mode === "observed" ? "Observed" : "Forward-looking"}
          </span>
          <span className="num rounded-full bg-card px-3 py-1.5 text-[13px] font-semibold text-mute shadow-card">{index + 1} / {scenes.length}</span>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div className="pointer-events-none absolute inset-0" style={{ opacity: m.opacity, maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE, maskComposite: "intersect", WebkitMaskComposite: "source-in" }}>
          <USStoryMap states={m.mapStates} zoom={m.zoom} frame={MAP_FRAME[m.layout]} showLabels={m.isMapScene} instant onReady={onMapReady} />
        </div>
        <div className="absolute inset-0 px-12 pb-6">
          <Layout layout={scene.layout} map={m.isMapScene} text={<SceneText scene={scene} layout={scene.layout} wide={wide} />} visual={<div className="w-full"><SceneVisualView visual={scene.visual} /></div>} />
        </div>
      </div>
      <div className="relative flex gap-1.5 px-12 pb-7">
        {scenes.map((s, i) => (
          <span key={s.id} className={cn("h-[5px] flex-1 rounded-full", i <= index ? (s.mode === "observed" ? "bg-ink/80" : "bg-teal") : "bg-line")} />
        ))}
      </div>
    </div>
  );
}

/**
 * Renders every briefing scene off screen at its final state, captures each as an image and saves a
 * 16:9 PowerPoint (one slide per scene, narration in the speaker notes). Libraries load on demand.
 */
export async function exportSlides(scenes: StoryScene[], month: MonthKey, onProgress: (i: number) => void) {
  const [{ toSvg, getFontEmbedCSS }, { default: PptxGenJS }] = await Promise.all([import("html-to-image"), import("pptxgenjs")]);
  const host = document.createElement("div");
  // Cancel the page zoom so the slide renders at exactly 1600 by 900.
  const z = parseFloat(getComputedStyle(document.body).zoom || "1") || 1;
  Object.assign(host.style, { position: "fixed", left: "-40000px", top: "0", width: `${W}px`, height: `${H}px`, zoom: String(1 / z), pointerEvents: "none" });
  host.setAttribute("aria-hidden", "true");
  document.body.appendChild(host);
  const skip = MotionGlobalConfig.skipAnimations;
  MotionGlobalConfig.skipAnimations = true;
  let root: ReturnType<typeof createRoot> | null = null;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = `What happened: ${monthLabel(month)}`;
  pptx.company = "Brightspeed";
  try {
    let fontCSS: string | undefined;
    for (let i = 0; i < scenes.length; i++) {
      onProgress(i);
      // A fresh root per slide: AnimatePresence initial={false} then renders every motion element
      // directly in its final state (no animation frames involved), so nothing is caught mid-animation.
      root?.unmount();
      host.replaceChildren();
      const mount = document.createElement("div");
      host.appendChild(mount);
      root = createRoot(mount);
      const r = root;
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        r.render(
          <MotionConfig skipAnimations>
            <AnimatePresence initial={false}>
              <StaticCharts.Provider value={true}><Slide key={i} scenes={scenes} index={i} month={month} onMapReady={done} /></StaticCharts.Provider>
            </AnimatePresence>
          </MotionConfig>,
        );
        setTimeout(done, 3000); // never wait forever for the map geometry
      });
      await sleep(500); // layout and fonts settle
      const node = mount.firstElementChild as HTMLElement;
      if (fontCSS === undefined) {
        try {
          fontCSS = await getFontEmbedCSS(node);
        } catch {
          fontCSS = "";
        }
      }
      const svg = await toSvg(node, { width: W, height: H, fontEmbedCSS: fontCSS || undefined, skipFonts: !fontCSS });
      const png = await rasterize(svg, 1.5);
      const slide = pptx.addSlide();
      slide.addImage({ data: png, x: 0, y: 0, w: 10, h: 5.625 });
      const s = scenes[i];
      slide.addNotes(plainText(`${s.kicker}. ${s.title}.\n\n${s.body}`));
    }
    await pptx.writeFile({ fileName: `Brightspeed What Happened ${monthLabel(month)}.pptx` });
  } finally {
    MotionGlobalConfig.skipAnimations = skip;
    root?.unmount();
    host.remove();
  }
}

/** "Download slides": saves the What Happened briefing as a PowerPoint deck. */
export function DownloadSlidesButton({ scenes, month, compact, onBefore }: { scenes: StoryScene[]; month: MonthKey; compact?: boolean; onBefore?: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    if (busy !== null) return;
    onBefore?.();
    setError(null);
    setBusy(0);
    try {
      await exportSlides(scenes, month, setBusy);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The slides could not be created.");
    } finally {
      setBusy(null);
    }
  };
  const label = busy !== null ? `Preparing ${busy + 1} of ${scenes.length}` : "Download slides";
  return (
    <span className="relative inline-flex">
      <button
        onClick={run}
        disabled={busy !== null || !scenes.length}
        aria-label={label}
        title={error ?? "Download the What Happened briefing as PowerPoint slides"}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-line bg-card font-semibold text-ink shadow-card transition hover:shadow-pop disabled:cursor-progress",
          compact ? "h-10 px-3.5 text-[12.5px]" : "h-11 px-4 text-[13.5px]",
        )}
      >
        {busy !== null ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        <span className={cn(compact && busy === null && "hidden sm:inline")}>{label}</span>
      </button>
      {error && <span role="alert" className="absolute right-0 top-[calc(100%+6px)] z-10 w-64 rounded-xl bg-bad-soft px-3 py-2 text-[12px] text-bad shadow-card">{error}</span>}
    </span>
  );
}
