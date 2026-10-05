"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, RotateCcw, Send, X } from "lucide-react";
import { GenieMark } from "../ui/Marks";
import { useApp } from "../AppContext";
import { ruleBasedProvider, suggestedQuestions, type AnswerProvider, type GenieAnswer } from "@/lib/ai/queryEngine";
import { cn, RichText } from "../ui/primitives";

interface Msg {
  id: number;
  role: "user" | "genie";
  text?: string;
  answer?: GenieAnswer;
}

const THINKING = ["Thinking…", "Reading the workbook…", "Crunching the numbers…", "Getting your answers ready…"];

function Thinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % THINKING.length), 650);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex animate-fade items-center gap-3 rounded-2xl rounded-bl-md border border-line bg-card px-4 py-3 shadow-card">
      <GenieMark size={26} className="genie-spin shrink-0" />
      <span key={i} className="shimmer-text animate-fade text-[13px] font-semibold">{THINKING[i]}</span>
    </div>
  );
}

/** Floating assistant. Pass a different `provider` (e.g. LLM-backed) to replace the rule-based engine. */
export function GenieDock({ provider = ruleBasedProvider }: { provider?: AnswerProvider }) {
  const { model, month, state, genieOpen, openGenie, closeGenie, genieSeed } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(1);
  const lastSeed = useRef(0);

  const ask = async (question: string) => {
    const uid = idRef.current++;
    setMsgs((m) => [...m, { id: uid, role: "user", text: question }]);
    setBusy(true);
    try {
      // A short, deliberate pause so the answer reads as considered rather than instantaneous.
      const [answer] = await Promise.all([provider.answer(question, { model, month, state }), new Promise((r) => setTimeout(r, 1500 + Math.random() * 1100))]);
      setMsgs((m) => [...m, { id: idRef.current++, role: "genie", answer }]);
    } catch (e) {
      setMsgs((m) => [...m, { id: idRef.current++, role: "genie", answer: { intent: "error", text: `I was unable to answer that (${e instanceof Error ? e.message : "unknown error"}).`, kpis: [] } }]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (genieSeed && genieSeed.n !== lastSeed.current) {
      lastSeed.current = genieSeed.n;
      void ask(genieSeed.q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genieSeed]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  const starters = useMemo(() => suggestedQuestions(model, month), [model, month]);

  return (
    <>
      {!genieOpen && (
        <button
          onClick={() => openGenie()}
          className="group fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2.5 rounded-full bg-panel pl-4 pr-5 text-sm font-semibold text-white shadow-pop transition hover:-translate-y-0.5"
          aria-label="Open Insights Genie"
        >
          <GenieMark size={34} />
          Insights Genie
        </button>
      )}

      <div
        className={cn(
          "fixed bottom-6 right-6 z-40 flex max-h-[min(720px,calc(100vh-48px))] w-[min(440px,calc(100vw-32px))] origin-bottom-right flex-col overflow-hidden rounded-[22px] border border-line bg-card shadow-pop transition duration-300",
          genieOpen ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
        )}
        aria-hidden={!genieOpen}
      >
        <div className="flex items-center gap-3 border-b border-line bg-panel px-5 py-4 text-white">
          <GenieMark size={38} className={cn(busy && "genie-spin")} />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold">Insights Genie</div>
            <div className="text-[11px] text-white/60">Exact answers from your data, computed in the browser</div>
          </div>
          {msgs.length > 0 && (
            <button onClick={() => setMsgs([])} disabled={busy} className="ml-auto flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40" aria-label="Clear chat">
              <RotateCcw className="size-3.5" /> Clear chat
            </button>
          )}
          <button onClick={closeGenie} className={cn(msgs.length ? "" : "ml-auto", "grid size-8 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white")} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-subtle p-4">
          {msgs.length === 0 && (
            <div>
              <p className="text-sm text-mute">Ask for any value, comparison, ranking, trend or breakdown across months, states and channels, or for insights and next steps. Try:</p>
              <div className="mt-3 flex flex-col gap-2">
                {starters.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-left text-[13px] font-medium transition hover:border-ink">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-panel px-4 py-2.5 text-[13.5px] text-white">{m.text}</div>
              </div>
            ) : (
              <div key={m.id} className="animate-rise space-y-3">
                <div className="rounded-2xl rounded-bl-md border border-line bg-card p-4 text-[13.5px] leading-relaxed text-ink-2 shadow-card">
                  {m.answer!.text.split("\n\n").map((p, i) => (
                    <p key={i} className={cn("whitespace-pre-line", i ? "mt-2.5" : "")}>
                      <RichText text={p} />
                    </p>
                  ))}
                  {m.answer!.kpis.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {m.answer!.kpis.map((k) => (
                        <div key={k.label} className="rounded-xl bg-subtle px-3 py-2">
                          <div className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-mute">{k.label}</div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="num text-lg font-semibold">{k.value}</span>
                            {k.delta && <span className={cn("num text-[11px] font-semibold", k.tone === "bad" ? "text-bad" : k.tone === "good" ? "text-good" : "text-mute")}>{k.delta}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {m.answer!.cta && (
                    <Link href={m.answer!.cta.href} onClick={closeGenie} className="bs-gradient mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-[#111] transition hover:brightness-95">
                      {m.answer!.cta.label} <ArrowRight className="size-3.5" />
                    </Link>
                  )}
                </div>
                {m.answer!.followUps && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.answer!.followUps.map((f) => (
                      <button key={f} onClick={() => ask(f)} className="rounded-full border border-line bg-card px-3 py-1 text-[12px] font-medium text-mute transition hover:border-ink hover:text-ink">
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
          {busy && <Thinking />}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim()) return;
            void ask(input.trim());
            setInput("");
          }}
          className="flex items-center gap-2 border-t border-line bg-card p-3"
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a follow up question…" className="h-10 min-w-0 flex-1 rounded-full border border-line bg-subtle px-4 text-[13.5px] outline-none focus:border-ink" />
          <button type="submit" className="grid size-10 place-items-center rounded-full bg-panel text-white transition hover:bg-panel-2" aria-label="Send">
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </>
  );
}
