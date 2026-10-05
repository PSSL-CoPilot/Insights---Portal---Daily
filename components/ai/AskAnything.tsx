"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { GenieMark } from "../ui/Marks";
import { useApp } from "../AppContext";
import { suggestedQuestions } from "@/lib/ai/queryEngine";
import { cn } from "../ui/primitives";

export function AskAnything() {
  const { model, month, openGenie } = useApp();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const suggestions = useMemo(() => suggestedQuestions(model, month), [model, month]);
  const shown = q.trim() ? suggestions.filter((s) => s.toLowerCase().includes(q.toLowerCase().split(" ")[0])).slice(0, 5) : suggestions;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, []);

  const submit = (text: string) => {
    if (!text.trim()) return;
    openGenie(text.trim());
    setQ("");
    setFocus(false);
    ref.current?.blur();
  };

  return (
    <div ref={box} className="relative w-full max-w-[760px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
        className={cn(
          "flex h-12 items-center gap-3 rounded-full border bg-card px-4 shadow-card transition",
          focus ? "border-ink ring-4 ring-brand/30" : "border-line hover:border-line",
        )}
      >
        <GenieMark size={28} className="shrink-0" />
        <input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
          placeholder="Ask anything: “cancels this week”, “cancel rate by channel”, “key insights”…"
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-soft"
          aria-label="Ask anything"
        />
        {q ? (
          <button type="submit" className="flex items-center gap-1 rounded-full bg-panel px-3 py-1 text-xs font-semibold text-white">
            Ask <CornerDownLeft className="size-3" />
          </button>
        ) : (
          <kbd className="hidden rounded-md border border-line bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-mute sm:block">/</kbd>
        )}
      </form>

      {focus && shown.length > 0 && (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-40 animate-fade overflow-hidden rounded-2xl border border-line bg-card p-2 shadow-pop">
          <div className="eyebrow px-3 pb-1 pt-2">Suggested questions</div>
          {shown.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => submit(s)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] text-ink transition hover:bg-subtle"
            >
              <Search className="size-3.5 shrink-0 text-soft" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
