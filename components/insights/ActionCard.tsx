"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Copy, Mail, MapPin, Send, Users, X } from "lucide-react";
import { actionEmail, type ActionItem, type Priority } from "@/lib/data/narratives";
import type { MonthKey } from "@/lib/data/types";
import { Badge, Button, Card, cn } from "../ui/primitives";
import { fmtInt } from "@/lib/format";

export type ActionStatus = "Open" | "In Progress" | "Completed";
export const STATUSES: ActionStatus[] = ["Open", "In Progress", "Completed"];

export interface ActionRecord {
  status: ActionStatus;
  initiatedAt?: string;
  to?: string;
}

const STORE = "bs.actions.v2";

/** Action status and initiation log, kept in this browser. */
export function useActionStore() {
  const [store, setStore] = useState<Record<string, ActionRecord>>({});
  useEffect(() => {
    try {
      setStore(JSON.parse(localStorage.getItem(STORE) ?? "{}"));
    } catch {}
  }, []);
  const update = useCallback((id: string, patch: Partial<ActionRecord>) => {
    setStore((cur) => {
      const next = { ...cur, [id]: { ...{ status: "Open" as ActionStatus }, ...cur[id], ...patch } };
      try {
        localStorage.setItem(STORE, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);
  return [store, update] as const;
}

const prio: Record<Priority, "bad" | "warn" | "indigo" | "neutral"> = { Critical: "bad", High: "warn", Medium: "indigo", Low: "neutral" };
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function ActionCard({ action, month, record, onUpdate, index = 0 }: { action: ActionItem; month: MonthKey; record?: ActionRecord; onUpdate: (p: Partial<ActionRecord>) => void; index?: number }) {
  const status = record?.status ?? "Open";
  const done = status === "Completed";
  const [evidence, setEvidence] = useState(false);
  const [initiate, setInitiate] = useState(false);
  return (
    <Card id={action.id} className={cn("flex animate-rise flex-col p-5 transition sm:p-6", done && "opacity-75")} style={{ animationDelay: `${index * 70}ms` }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={prio[action.priority]}>{action.priority.toUpperCase()}</Badge>
            {action.saves != null && <span className="num rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-semibold leading-5 text-teal">about {fmtInt(action.saves)} potential saves</span>}
            <span className="text-xs text-mute">{action.owner}</span>
          </div>
          <h3 className={cn("mt-2.5 text-[19px] font-semibold tracking-tight", done && "line-through decoration-2")}>{action.title}</h3>
        </div>
        <div role="radiogroup" aria-label="Status" className="inline-flex rounded-full border border-line bg-line-2 p-1">
          {STATUSES.map((s) => (
            <button key={s} role="radio" aria-checked={status === s} onClick={() => onUpdate({ status: s })} className={cn("rounded-full px-3 py-1 text-[12px] font-semibold transition", status === s ? (s === "Completed" ? "bg-good text-white" : s === "In Progress" ? "bg-brand text-[#111]" : "bg-panel text-white") : "text-mute hover:text-ink")}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-card p-3.5">
          <dt className="eyebrow flex items-center gap-1.5"><MapPin className="size-3" /> Market</dt>
          <dd className="mt-1 text-[15px] font-semibold">{action.market}</dd>
        </div>
        <div className="rounded-xl border border-line bg-card p-3.5 sm:col-span-2">
          <dt className="eyebrow flex items-center gap-1.5"><Users className="size-3" /> Affected population</dt>
          <dd className="mt-1 flex items-baseline gap-2"><span className="num text-xl font-semibold">{action.population !== null ? fmtInt(action.population) : "n/a"}</span><span className="text-xs text-mute">{action.populationLabel}</span></dd>
        </div>
      </dl>

      <div className="mt-4 space-y-2 text-[13.5px] leading-relaxed">
        <p><strong>Expected impact:</strong> <span className="text-ink-2">{action.impact}</span></p>
        <p className="text-mute"><strong className="text-ink-2">Why:</strong> {action.why}</p>
      </div>

      {evidence && (
        <div className="mt-4 animate-rise rounded-2xl border border-line bg-card p-4">
          <div className="eyebrow mb-2">Supporting evidence</div>
          <ul className="space-y-1.5 text-[13px] text-ink-2">
            {action.evidence.map((e) => <li key={e} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-indigo" />{e}</li>)}
          </ul>
          <div className="mt-3 text-[12.5px] text-mute"><strong className="text-ink-2">Success measures:</strong> {action.measures.join("; ")}</div>
          <Link href={action.href} className="group mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink underline decoration-dotted underline-offset-4">
            {action.hrefLabel} <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}

      {record?.initiatedAt && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-good-soft px-3.5 py-2.5 text-[12.5px] text-good">
          <Check className="size-4 shrink-0" /> Initiated {when(record.initiatedAt)}; email prepared for {record.to ?? action.ownerEmail}.
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-5">
        <Button variant="brand" onClick={() => setInitiate(true)}><Mail className="size-4" /> {record?.initiatedAt ? "Send again" : "Initiate action"}</Button>
        <Button variant="outline" onClick={() => setEvidence((v) => !v)} aria-expanded={evidence}>
          {evidence ? "Hide evidence" : "See evidence"} <ChevronDown className={cn("size-4 transition", evidence && "rotate-180")} />
        </Button>
      </div>

      {initiate && (
        <InitiateDialog action={action} month={month} onClose={() => setInitiate(false)} onSent={(to) => onUpdate({ status: status === "Completed" ? status : "In Progress", initiatedAt: new Date().toISOString(), to })} />
      )}
    </Card>
  );
}

const STEPS = ["Draft", "Review", "Send", "Track"];

/** Workflow: draft the owner email from the data, let the user review and edit it, hand it to the mail client, then track. */
function InitiateDialog({ action, month, onClose, onSent }: { action: ActionItem; month: MonthKey; onClose: () => void; onSent: (to: string) => void }) {
  const draft = actionEmail(action, month);
  const [to, setTo] = useState(action.ownerEmail);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [step, setStep] = useState(2);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = () => {
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    onSent(to);
    setStep(4);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  // Portal to <body>: the card's entrance animation leaves a transform that would trap a fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={`Initiate ${action.title}`}>
      <div className="fixed inset-0 animate-fade bg-black/55" onClick={onClose} />
      <div className="relative my-auto w-full max-w-2xl animate-rise overflow-hidden rounded-[22px] border border-line bg-card shadow-pop">
        <div className="bs-gradient px-6 py-5 text-[#111]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-70">Initiate action</div>
              <div className="mt-1 text-[19px] font-semibold leading-tight">{action.title}</div>
              <div className="mt-0.5 text-[13px] opacity-80">{action.owner} · {action.market} · {action.priority} priority</div>
            </div>
            <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-white/40 transition hover:bg-white/70"><X className="size-4" /></button>
          </div>
          <ol className="mt-4 grid grid-cols-4 gap-2">
            {STEPS.map((s, i) => (
              <li key={s} className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold", i + 1 <= step ? "bg-[#111] text-white" : "bg-white/40")}>
                <span className="grid size-4 place-items-center rounded-full bg-white/25 text-[10px]">{i + 1 < step ? <Check className="size-3" /> : i + 1}</span>{s}
              </li>
            ))}
          </ol>
        </div>

        {step < 4 ? (
          <div className="space-y-3 p-6">
            <label className="block text-[12px] font-semibold text-mute">
              To (task owner)
              <input value={to} onChange={(e) => { setTo(e.target.value); setStep(2); }} type="email" className="mt-1 h-10 w-full rounded-xl border border-line bg-subtle px-3 text-[13.5px] text-ink outline-none focus:border-ink" />
            </label>
            <label className="block text-[12px] font-semibold text-mute">
              Subject
              <input value={subject} onChange={(e) => { setSubject(e.target.value); setStep(2); }} className="mt-1 h-10 w-full rounded-xl border border-line bg-subtle px-3 text-[13.5px] text-ink outline-none focus:border-ink" />
            </label>
            <label className="block text-[12px] font-semibold text-mute">
              Message (drafted from the data; edit as required)
              <textarea value={body} onChange={(e) => { setBody(e.target.value); setStep(2); }} rows={14} className="mt-1 w-full rounded-xl border border-line bg-subtle p-3 font-sans text-[13px] leading-relaxed text-ink outline-none focus:border-ink" />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-[11.5px] text-soft">Sending opens your email client with this message addressed to the owner.</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={copy}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}</Button>
                <Button variant="primary" onClick={send} disabled={!to.includes("@")}><Send className="size-4" /> Send to owner</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-good-soft text-good"><Check className="size-6" /></span>
            <div className="mt-3 text-[17px] font-semibold">Email handed to your mail client</div>
            <p className="mx-auto mt-1 max-w-md text-[13.5px] text-mute">Addressed to <strong className="text-ink">{to}</strong>. The action is now <strong className="text-ink">In Progress</strong> and will be tracked on this page.</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>Edit and resend</Button>
              <Button variant="primary" onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
