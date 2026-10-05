"use client";

import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, DatabaseZap } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Status } from "@/lib/data/metrics";
import type { Severity } from "@/lib/data/narratives";

export const cn = clsx;

export function Card({ className, children, interactive, ...rest }: { className?: string; children: ReactNode; interactive?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-[26px] border border-line/80 bg-card shadow-card dark:border-white/[0.06]",
        interactive && "transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1 hover:border-line hover:shadow-pop cursor-pointer",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, sub, right, className }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h2 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h2>
        {sub && <p className="mt-1 max-w-3xl text-sm text-mute">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

type Tone = "neutral" | "bad" | "good" | "warn" | "indigo" | "brand" | "ink";
const tones: Record<Tone, string> = {
  neutral: "bg-line-2 text-mute",
  bad: "bg-bad-soft text-bad",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  indigo: "bg-indigo-soft text-indigo",
  brand: "bg-brand text-[#111]",
  ink: "bg-panel text-white",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5", tones[tone], className)}>{children}</span>;
}

export const statusTone = (s: Status): Tone => (s === "critical" ? "bad" : s === "warning" ? "warn" : s === "healthy" ? "good" : "neutral");
export const statusColor = (s: Status) => (s === "critical" ? "#d92d20" : s === "warning" ? "#e59b12" : s === "healthy" ? "#12a150" : "#9a9a94");

/** Business direction colour: growth in sales or installs is good, growth in any cancellation measure is bad. */
export function dirTone(good: "up" | "down" | "neutral", delta: number | null | undefined): "good" | "bad" | "neutral" {
  if (delta === null || delta === undefined || good === "neutral" || Math.abs(delta) < 1e-9) return "neutral";
  return (delta > 0) === (good === "up") ? "good" : "bad";
}
export const toneColor = (t: "good" | "bad" | "neutral") => (t === "good" ? "#12a150" : t === "bad" ? "#d92d20" : "#f28c28");

export function StatusDot({ status, pulse }: { status: Status; pulse?: boolean }) {
  return (
    <span
      className={cn("inline-block size-2 rounded-full", pulse && status === "critical" && "animate-pulse-ring")}
      style={{ background: statusColor(status) }}
      aria-label={status}
    />
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const map: Record<Severity, { tone: Tone; label: string }> = {
    critical: { tone: "bad", label: "CRITICAL" },
    high: { tone: "warn", label: "HIGH" },
    medium: { tone: "indigo", label: "MEDIUM" },
    low: { tone: "neutral", label: "LOW" },
  };
  const m = map[severity];
  return <Badge tone={m.tone} className="tracking-wider">{m.label}</Badge>;
}

export function Button({
  variant = "primary", size = "md", className, children, ...rest
}: { variant?: "primary" | "brand" | "ghost" | "outline"; size?: "sm" | "md" | "lg" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = {
    primary: "bg-panel text-white hover:bg-panel-2",
    brand: "bs-gradient text-[#111] hover:brightness-95",
    ghost: "text-ink hover:bg-black/5",
    outline: "border border-line bg-card text-ink hover:border-ink",
  }[variant];
  const s = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-[15px]" }[size];
  return (
    <button {...rest} className={cn("inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.98] disabled:opacity-50", v, s, className)}>
      {children}
    </button>
  );
}

export function LinkButton({
  href, children, variant = "outline", size = "md", arrow = true, className,
}: { href: string; children: ReactNode; variant?: "primary" | "brand" | "ghost" | "outline"; size?: "sm" | "md" | "lg"; arrow?: boolean; className?: string }) {
  const v = {
    primary: "bg-panel text-white hover:bg-panel-2",
    brand: "bs-gradient text-[#111] hover:brightness-95",
    ghost: "text-ink hover:bg-black/5",
    outline: "border border-line bg-card text-ink hover:border-ink",
  }[variant];
  const s = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-[15px]" }[size];
  return (
    <Link href={href} className={cn("group inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.98]", v, s, className)}>
      {children}
      {arrow && <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />}
    </Link>
  );
}

export function Tabs<T extends string>({
  tabs, value, onChange, className, size = "md",
}: { tabs: { id: T; label: string; hint?: string }[]; value: T; onChange: (t: T) => void; className?: string; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className={cn("inline-flex max-w-full flex-wrap gap-1 rounded-full border border-line/70 bg-subtle p-1", className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "rounded-full font-semibold transition-colors duration-200",
            size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-[13px]",
            value === t.id ? "bg-card text-ink shadow-[0_2px_10px_-3px_rgba(0,0,0,0.18)]" : "text-mute hover:text-ink",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const TONE_TEXT: Record<string, string> = { bad: "text-bad", good: "text-good", warn: "text-warn", teal: "text-teal", neutral: "text-ink" };

/**
 * Renders `**bold**` markers as emphasised spans, `[[label|href]]` as subtle inline entity links and
 * `{{bad:+36%}}` / `{{good:+5%}}` as coloured values (red for deterioration, green for improvement).
 */
export function RichText({ text, className, linkClassName }: { text: string; className?: string; linkClassName?: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\[[^\]|]+\|[^\]]+\]\]|\{\{(?:bad|good|warn|teal|neutral):[^}]+\}\})/g).filter(Boolean);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.startsWith("**")) return <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong>;
        if (p.startsWith("{{")) {
          const [tone, value] = p.slice(2, -2).split(/:(.*)/s);
          return <span key={i} className={cn("num font-semibold", TONE_TEXT[tone])}>{value}</span>;
        }
        if (p.startsWith("[[")) {
          const [label, href] = p.slice(2, -2).split("|");
          return (
            <Link
              key={i}
              href={href}
              className={cn(
                "rounded-sm font-semibold text-ink underline decoration-brand-2/60 decoration-[1.5px] underline-offset-[3px] transition-colors hover:decoration-brand-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                linkClassName,
              )}
            >
              {label}
            </Link>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}

/** Strips RichText markup, for aria labels and plain text contexts. */
export const plainText = (t: string) => t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[\[([^\]|]+)\|[^\]]+\]\]/g, "$1").replace(/\{\{\w+:([^}]+)\}\}/g, "$1");

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-subtle px-8 py-14 text-center">
      <div className="grid size-11 place-items-center rounded-full bg-card text-mute shadow-card">{icon ?? <DatabaseZap className="size-5" />}</div>
      <div className="text-[15px] font-semibold">{title}</div>
      {children && <div className="max-w-md text-sm text-mute">{children}</div>}
    </div>
  );
}

export function Delta({ value, kind, tone, className, digits = 0 }: { value: number | null; kind: "rel" | "pp"; tone?: "bad" | "good" | "neutral"; className?: string; digits?: number }) {
  if (value === null) return <span className={cn("text-xs text-soft", className)}>n/a</span>;
  const p = value * 100;
  const sign = Number(Math.abs(p).toFixed(digits)) === 0 ? "" : p > 0 ? "+" : "−";
  const txt = `${sign}${Math.abs(p).toFixed(digits)}${kind === "pp" ? " pp" : "%"}`;
  return (
    <span className={cn("num text-xs font-semibold", tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : "text-mute", className)}>{txt}</span>
  );
}
