"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ShieldCheck, X } from "lucide-react";
import { useApp } from "../AppContext";
import { ActionCard, useActionStore } from "../insights/ActionCard";
import { buildActions } from "@/lib/data/narratives";
import { buildRecommendations } from "@/lib/story/narrative";
import { fmtInt, monthLabel } from "@/lib/format";
import { ModeTag } from "./NarrativeList";
import { Donut } from "../charts/Donut";

const SAVE_COLORS = ["var(--color-teal)", "#5fb3d9", "#9ad6a6"];

/** In-context "Take Action" drawer: the recommended actions with the existing Initiate workflow. */
export function ActionsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { model, month } = useApp();
  const actions = useMemo(() => buildActions(model, month), [model, month]);
  const rec = useMemo(() => buildRecommendations(model, month), [model, month]);
  const [store, update] = useActionStore();
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      // Let an open Initiate dialog handle its own Escape first.
      if (e.key === "Escape" && !document.querySelector('[aria-label^="Initiate "]')) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => panel.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-labelledby="actions-drawer-title">
          <motion.div className="absolute inset-0 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={onClose} />
          <motion.div
            ref={panel}
            tabIndex={-1}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 36 }}
            className="absolute inset-y-0 right-0 flex w-full max-w-[760px] flex-col border-l border-line bg-canvas shadow-pop outline-none"
          >
            <div className="border-b border-line bg-card px-5 py-5 sm:px-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2"><ModeTag mode="preventive" /><span className="eyebrow">{monthLabel(month)}</span></div>
                  <h2 id="actions-drawer-title" className="mt-2 text-[22px] font-semibold tracking-tight">Recommended intervention</h2>
                  <p className="mt-1 text-[13px] text-mute">Initiate an action to draft the owner email from the data, review it and send it.</p>
                </div>
                <button onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-card text-mute transition hover:border-ink hover:text-ink"><X className="size-4" /></button>
              </div>
              {rec.items.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center gap-5">
                <Donut
                  size={132}
                  thickness={18}
                  data={rec.items.map((r, i) => ({ name: r.label, value: r.saves ?? 0, color: SAVE_COLORS[i % SAVE_COLORS.length], detail: `${fmtInt(r.saves)} saves` }))}
                  center={<div><div className="num-display text-[22px] leading-none">{fmtInt(rec.dedup)}</div><div className="mt-0.5 text-[10px] text-mute">orders</div></div>}
                />
                <div className="grid min-w-[280px] flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                  {rec.items.map((r) => (
                    <a key={r.id} href={r.actionId ? `#${r.actionId}` : undefined} className="rounded-xl border border-line bg-subtle px-3 py-2.5 transition hover:border-teal">
                      <div className="num flex items-center gap-1.5 text-[19px] font-semibold text-ink"><span className="size-2 rounded-full" style={{ background: SAVE_COLORS[rec.items.indexOf(r) % SAVE_COLORS.length] }} />{fmtInt(r.saves)}</div>
                      <div className="text-[11.5px] leading-tight text-mute">{r.label}</div>
                    </a>
                  ))}
                  {rec.dedup !== null && (
                    <div className="rounded-xl bg-teal px-3 py-2.5 text-white dark:text-[#0e0f11]">
                      <div className="num flex items-center gap-1.5 text-[19px] font-semibold"><ShieldCheck className="size-4" />{fmtInt(rec.dedup)}</div>
                      <div className="text-[11.5px] leading-tight opacity-85">Orders protected, counted once</div>
                    </div>
                  )}
                </div>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
              {actions.map((a, i) => (
                <ActionCard key={a.id} action={a} month={month} index={i} record={store[a.id]} onUpdate={(p) => update(a.id, p)} />
              ))}
            </div>
            <div className="border-t border-line bg-card px-5 py-4 sm:px-7">
              <Link href={`/actions?month=${month}`} onClick={onClose} className="bs-gradient group inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-[14px] font-semibold text-[#111] transition hover:brightness-95">
                Open full Action Center <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
