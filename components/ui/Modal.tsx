"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "./primitives";

/** Large centred modal (≈80% viewport width) with scrim, ESC-to-close and body scroll lock. */
export function Modal({
  open, onClose, header, children, className,
}: { open: boolean; onClose: () => void; header: ReactNode; children: ReactNode; className?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-6 lg:p-8" role="dialog" aria-modal="true">
      <div className="fixed inset-0 animate-fade bg-panel/45" onClick={onClose} />
      <div
        className={cn(
          "modal-enter relative my-auto w-full max-w-[1280px] overflow-hidden rounded-[24px] border border-line bg-canvas shadow-pop lg:w-[82vw]",
          className,
        )}
      >
        <div className="sticky top-0 z-10 border-b border-line bg-card">
          {header}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 grid size-9 place-items-center rounded-full border border-line bg-card text-mute transition hover:border-ink hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        {/* Fixed height so switching tabs never resizes the dialog. */}
        <div className="h-[calc(100dvh-250px)] min-h-[420px] overflow-y-auto overscroll-contain p-5 sm:p-7">{children}</div>
      </div>
    </div>
  );
}
