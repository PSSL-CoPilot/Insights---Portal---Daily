/**
 * Insights Genie: a deterministic question engine that runs entirely in the browser over the
 * workbook data baked into the site. It parses the metric, month(s), state and channel from the
 * question, looks the exact numbers up in the model, and answers value, comparison, ranking,
 * trend, breakdown and insight questions. "Why" and "what next" questions fall through to the
 * narrative handlers, which are also computed from the data.
 */
import { parseKey } from "../data/daily";
import type { DataModel, MonthKey } from "../data/types";
import {
  channelRows, chScope, getSnapshot, prevMonth, reasonStats, scopeName, series, stateRows, watchSignals, REASON_LABELS, nk, type Snapshot,
} from "../data/metrics";
import { buildActions, buildInsights, diagnose } from "../data/narratives";
import { buildExecutiveNarrative } from "../story/narrative";
import { fmtInt, fmtPct, fmtPct0, fmtPp, fmtSignedPct, monthName, monthShort, stateSlug } from "../format";
import { analysisHref } from "../story/links";

export interface GenieContext {
  model: DataModel;
  month: MonthKey;
  state: string | null;
}

export interface GenieKpi {
  label: string;
  value: string;
  delta?: string;
  tone?: "bad" | "good" | "neutral";
}

export interface GenieAnswer {
  intent: string;
  /** Text with `**bold**` markers. Paragraphs are separated by blank lines. */
  text: string;
  kpis: GenieKpi[];
  cta?: { label: string; href: string };
  followUps?: string[];
}

export interface AnswerProvider {
  answer(question: string, ctx: GenieContext): GenieAnswer | Promise<GenieAnswer>;
}

/**
 * Month word to period key. Day-wise data: "sep 24 to 30" / "sep 30" is the 7 day window ending that day,
 * the baseline month is its average week, and any other mention of the data month is the selected window.
 */
function dayWindow(model: DataModel, month: MonthKey, idx: number, from: string): MonthKey | null {
  const mon = String(idx + 1).padStart(2, "0");
  if (!model.daily) return model.months.find((x) => +x.slice(5, 7) === idx + 1) ?? null;
  const d = from.match(/^[a-z]*\s+(\d{1,2})(?:\s+to\s+(\d{1,2}))?/);
  const day = (x: string | undefined) => x && model.months.find((k) => k.slice(5) === `${mon}-${x.padStart(2, "0")}`);
  const a = day(d?.[1]), b = day(d?.[2]);
  if (a && b) return a === b ? a : `${b}~${a}` === month ? month : a; // a range other than the selected one: its first day
  if (a) return a;
  return month.slice(5, 7) === mon ? month : null;
}

/** Suggestions that follow the selected month. */
export function suggestedQuestions(model: DataModel, month: MonthKey): string[] {
  const pm = prevMonth(model, month);
  return [
    "What is driving cancellations in this period?",
    ...(pm ? ["What were the sales and cancels in the previous period?", "Compare cancel rate this period vs the previous period"] : []),
    "Which channel has the highest cancel rate?",
    "Break down cancellations by state",
    "Show the Post ODD share trend",
    "What are the key insights?",
    "What should Brightspeed do next?",
  ];
}

// ------------------------------------------------------------------ parsing
interface Metric {
  id: string;
  label: string;
  unit: "count" | "pct";
  good: "up" | "down" | "neutral";
  get: (s: Snapshot) => number | null;
}

const k = (key: string) => (s: Snapshot) => s[key] ?? null;
const reason = (label: string) => k(`reason:${nk(label)}`);
const SHARE = /%|share|percent|proportion|mix|ratio|rate/;

/** Ordered: more specific patterns first. Each entry: [pattern, count metric, optional pct metric when the question asks for a share]. */
const METRIC_TABLE: [RegExp, Metric, Metric?][] = [
  [/cancel(lation)?s? rate|churn rate/, { id: "cancelRate", label: "Cancel rate", unit: "pct", good: "down", get: k("cancelRate") }],
  [/install(ation)? rate|conversion/, { id: "installRate", label: "Install rate", unit: "pct", good: "up", get: (s) => (s.installs !== null && s.sales ? s.installs / s.sales : null) }],
  [/on.?time/, { id: "onTime", label: "On Time Install %", unit: "pct", good: "up", get: k("onTimePct") }],
  [/post.?odd|after (the )?(original )?due/, { id: "postN", label: "Post ODD cancellations", unit: "count", good: "down", get: k("postCancels") }, { id: "post", label: "Post ODD share", unit: "pct", good: "down", get: k("postPct") }],
  [/pre.?odd|before (the )?(original )?due/, { id: "preN", label: "Pre ODD cancellations", unit: "count", good: "down", get: k("preCancels") }, { id: "pre", label: "Pre ODD share", unit: "pct", good: "neutral", get: k("prePct") }],
  [/on.?odd|on (the )?(original )?due/, { id: "onN", label: "On ODD cancellations", unit: "count", good: "down", get: k("onCancels") }, { id: "on", label: "On ODD share", unit: "pct", good: "neutral", get: k("onPct") }],
  [/customer miss/, { id: "custN", label: "Customer Miss cancellations", unit: "count", good: "down", get: k("custMiss") }, { id: "cust", label: "Customer Miss share", unit: "pct", good: "down", get: k("custPct") }],
  [/company miss/, { id: "coN", label: "Company Miss cancellations", unit: "count", good: "down", get: k("coMiss") }, { id: "co", label: "Company Miss share", unit: "pct", good: "down", get: k("coPct") }],
  [/faux/, { id: "fauxN", label: "Faux cancellations", unit: "count", good: "neutral", get: k("faux") }, { id: "faux", label: "Faux share", unit: "pct", good: "neutral", get: k("fauxPct") }],
  [/true cancel/, { id: "true", label: "True cancellations", unit: "count", good: "down", get: k("trueCancels") }],
  [/pending|customer contact/, { id: "pending", label: "Pending Customer Contact", unit: "pct", good: "down", get: k("pendingPct") }],
  [/jeopardy/, { id: "jeopardy", label: "Install in Jeopardy", unit: "pct", good: "down", get: k("jeopardyPct") }],
  [/bsw/, { id: "bsw", label: "BSW Delay Predicted", unit: "pct", good: "down", get: k("bswPct") }],
  [/action needed/, { id: "action", label: "Action Needed Not Jeopardy", unit: "pct", good: "down", get: k("actionPct") }],
  [/buyer/, { id: "r-buyers", label: REASON_LABELS.buyers, unit: "count", good: "down", get: reason(REASON_LABELS.buyers) }],
  [/requested cancel/, { id: "r-cancel", label: REASON_LABELS.cancel, unit: "count", good: "down", get: reason(REASON_LABELS.cancel) }],
  [/no access|not home/, { id: "r-noaccess", label: REASON_LABELS.noAccess, unit: "count", good: "down", get: reason(REASON_LABELS.noAccess) }],
  [/reschedul/, { id: "r-resched", label: REASON_LABELS.resched, unit: "count", good: "down", get: reason(REASON_LABELS.resched) }],
  [/tech(nician)? on (the )?job|tech on site/, { id: "r-tech", label: REASON_LABELS.tech, unit: "count", good: "down", get: reason(REASON_LABELS.tech) }],
  [/cancel|churn|disconnect/, { id: "cancels", label: "Cancellations", unit: "count", good: "down", get: k("cancels") }],
  [/install/, { id: "installs", label: "Installs", unit: "count", good: "up", get: k("installs") }],
  [/\bsales?\b|\bsold\b|orders?|demand|gross adds?/, { id: "sales", label: "Unique Sales", unit: "count", good: "up", get: k("sales") }],
];

const MONTH_WORDS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const STATE_ABBR: Record<string, string> = { nc: "North Carolina", oh: "Ohio", mi: "Michigan", mo: "Missouri", ms: "Mississippi", nj: "New Jersey" };

interface Parsed {
  metrics: Metric[];
  months: MonthKey[];
  since: MonthKey | null;
  states: string[];
  channels: string[];
}

function parse(q: string, model: DataModel, month: MonthKey): Parsed {
  const t = ` ${q.toLowerCase().replace(/[?.,!]/g, " ")} `;
  const metrics: Metric[] = [];
  let rest = t;
  for (const [re, count, pct] of METRIC_TABLE) {
    const m = rest.match(re);
    if (!m) continue;
    metrics.push(pct && SHARE.test(t) ? pct : count);
    rest = rest.replace(new RegExp(re.source, "g"), " ");
  }
  // "sales and cancels" style questions keep both; a rate metric already covers its base words
  // months: explicit names in order, then relative phrases
  const found: { i: number; m: MonthKey }[] = [];
  MONTH_WORDS.forEach((w, idx) => {
    const re = new RegExp(`\\b${w}[a-z]*\\b`, "g");
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(t))) {
      if (w === "may" && /\bmay (i|we|you)\b/.test(t)) continue;
      found.push(...[dayWindow(model, month, idx, t.slice(mm.index))].filter((k): k is MonthKey => !!k).map((m) => ({ i: mm!.index, m })));
    }
  });
  const pm = prevMonth(model, month);
  if (/last month|previous month|prior month|previous period|prior period|last week/.test(t) && pm) found.push({ i: t.search(/last month|previous month|prior month|previous period|prior period|last week/), m: pm });
  if (/this month|current month|latest month|this week|this period|last 7 days/.test(t)) found.push({ i: t.search(/this month|current month|latest month|this week|this period|last 7 days/), m: month });
  found.sort((a, b) => a.i - b.i);
  let months = [...new Set(found.map((f) => f.m))];
  let since: MonthKey | null = null;
  const sinceM = t.match(/\b(since|from)\s+([a-z]+)/);
  if (sinceM) {
    const idx = MONTH_WORDS.findIndex((w) => sinceM[2].startsWith(w));
    since = model.months.find((x) => +x.slice(5, 7) === idx + 1) ?? null;
  }
  if (/year to date|ytd|this year|all months|jan(uary)? to|since the start/.test(t)) since ??= model.months[0];

  const states = model.states.filter((s) => t.includes(` ${s.toLowerCase()} `) || t.includes(` ${s.toLowerCase()}'`) || t.includes(`${s.toLowerCase()}`));
  for (const [ab, st] of Object.entries(STATE_ABBR)) if (new RegExp(`\\b${ab}\\b`).test(t) && model.states.includes(st) && !states.includes(st)) states.push(st);
  const channels: string[] = [];
  const chText = t.replace(/door to door/g, "d2d");
  for (const c of [...model.channelNames].sort((a, b) => b.length - a.length)) {
    const lc = c.toLowerCase();
    if (lc === "other" ? /other channel/.test(chText) : chText.includes(` ${lc} `) || chText.includes(` ${lc}'`)) {
      if (!channels.some((x) => x.toLowerCase().includes(lc))) channels.push(c);
    }
  }
  months = months.filter((m) => model.months.includes(m) || m === model.baselineMonth || m === month);
  // "no access cancels": the generic cancellations metric is only kept when the question joins metrics ("sales and cancels")
  if (metrics.length > 1 && !/\band\b|&|,/.test(q.toLowerCase())) metrics.splice(1);
  return { metrics, months, since, states, channels };
}

// ------------------------------------------------------------------ data answers
const kp = (label: string, value: string, delta?: string, tone?: GenieKpi["tone"]): GenieKpi => ({ label, value, delta, tone });
const fmtV = (m: Metric, v: number | null) => (m.unit === "pct" ? fmtPct(v) : fmtInt(v));
const fmtD = (m: Metric, a: number | null, b: number | null) => (a === null || b === null ? undefined : m.unit === "pct" ? fmtPp(b - a, 1) : a ? fmtSignedPct(b / a - 1) : undefined);
const toneD = (m: Metric, a: number | null, b: number | null): GenieKpi["tone"] => {
  if (a === null || b === null || m.good === "neutral" || a === b) return "neutral";
  return (b > a) === (m.good === "up") ? "good" : "bad";
};
const verb = (m: Metric, a: number | null, b: number | null) => (a === null || b === null ? "moved" : b > a ? "increased" : b < a ? "decreased" : "was unchanged");

function scopesOf(p: Parsed, ctx: GenieContext): { scope: string | null; label: string }[] {
  if (p.states.length === 1 && p.channels.length === 1) return [{ scope: p.states[0], label: `${p.states[0]} ${p.channels[0]}` }];
  const out = [...p.states.map((s) => ({ scope: s, label: s })), ...p.channels.map((c) => ({ scope: chScope(c), label: `${c} channel` }))];
  if (out.length) return out;
  return [{ scope: ctx.state, label: ctx.state ? `${ctx.state} (current filter)` : "the portfolio" }];
}

function dataAnswer(question: string, ctx: GenieContext): GenieAnswer | null {
  const { model } = ctx;
  const q = question.toLowerCase();
  const p = parse(question, model, ctx.month);
  const wantsInsight = /\binsights?\b|key findings?|highlights?|biggest movers?|what stands out|notable/.test(q);
  if (wantsInsight) return insightAnswer(ctx);
  if (!p.metrics.length) return null;

  const scopes = scopesOf(p, ctx);
  const month = p.months[p.months.length - 1] ?? ctx.month;
  const M = monthName(month);
  const q2 = `month=${month}`;
  const byChannel = /channel/.test(q) && !p.channels.length;
  const byState = /state|market|region/.test(q) && !p.states.length;

  // ---- breakdown across states or channels
  if (/break ?down|by state|by channel|each state|each channel|per state|per channel|split|across (states|channels)|all (states|channels)/.test(q)) {
    const m = p.metrics[0];
    const dimChannel = byChannel || (/channel/.test(q) && !/state/.test(q));
    const rows = (dimChannel ? model.channelNames.map((c) => ({ name: c, scope: chScope(c) })) : model.states.map((s) => ({ name: s, scope: s }))).map((r) => {
      const v = m.get(getSnapshot(model, month, r.scope));
      const pm = prevMonth(model, month);
      const pv = pm ? m.get(getSnapshot(model, pm, r.scope)) : null;
      return { ...r, v, pv };
    }).sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));
    const total = m.unit === "count" ? rows.reduce((a, r) => a + (r.v ?? 0), 0) : null;
    return {
      intent: "breakdown",
      text: `**${m.label} by ${dimChannel ? "channel" : "state"}, ${M}:**\n\n` +
        rows.map((r, i) => `${i + 1}. **${r.name}**: ${fmtV(m, r.v)}${total ? ` (${fmtPct0((r.v ?? 0) / total)} of total)` : ""}${fmtD(m, r.pv, r.v) ? `, ${fmtD(m, r.pv, r.v)} vs the previous period` : ""}`).join("\n") +
        (total ? `\n\nTotal: **${fmtInt(total)}**.` : ""),
      kpis: rows.slice(0, 4).map((r) => kp(r.name, fmtV(m, r.v), fmtD(m, r.pv, r.v), toneD(m, r.pv, r.v))),
      cta: { label: "Open Detailed Analysis", href: `/states?${q2}` },
      followUps: [`Which ${dimChannel ? "channel" : "state"} has the highest cancel rate?`],
    };
  }

  // ---- ranking
  if (/\bwhich\b|highest|lowest|worst|best|\btop\b|most|least|rank|largest|smallest|biggest/.test(q) && (byChannel || byState || /which (state|channel|market)/.test(q))) {
    const m = p.metrics[0];
    const dimChannel = byChannel;
    const low = /lowest|least|smallest|best/.test(q) && m.good !== "up" ? true : /lowest|least|smallest|worst/.test(q) && m.good === "up";
    const rows = (dimChannel ? model.channelNames.map((c) => ({ name: c, scope: chScope(c) })) : model.states.map((s) => ({ name: s, scope: s })))
      .map((r) => ({ ...r, v: m.get(getSnapshot(model, month, r.scope)) }))
      .filter((r) => r.v !== null)
      .sort((a, b) => (low ? (a.v! - b.v!) : (b.v! - a.v!)));
    if (!rows.length) return null;
    const top = rows[0];
    return {
      intent: "ranking",
      text: `**${top.name}** has the ${low ? "lowest" : "highest"} ${m.label.toLowerCase()} in ${M}: **${fmtV(m, top.v)}**.\n\nFull ranking: ${rows.map((r) => `${r.name} ${fmtV(m, r.v)}`).join(" · ")}.`,
      kpis: rows.slice(0, 3).map((r) => kp(r.name, fmtV(m, r.v))),
      cta: { label: `Open ${top.name} analysis`, href: analysisHref(dimChannel ? { channel: top.name } : { state: top.name }, month) },
    };
  }

  // ---- trend
  if (p.since || /trend|over time|month by month|each month|monthly|history|so far|since/.test(q)) {
    const m = p.metrics[0];
    const s = scopes[0];
    // Day-wise: by default the trend covers the selected period (a single day: the two weeks up to it).
    const dailyFrom = () => { const [s0, e0] = parseKey(ctx.month); const i = model.months.indexOf(e0); return s0 !== e0 ? s0 : model.months[Math.max(0, i - 13)]; };
    const from = p.since ?? (p.months.length >= 2 ? p.months[0] : model.daily ? dailyFrom() : model.months[0]);
    const to = p.months.length >= 2 ? p.months[p.months.length - 1] : ctx.month;
    const pts = model.months.filter((x) => x >= from && x <= (model.daily ? parseKey(to)[1] : to)).map((x) => ({ m: x, v: m.get(getSnapshot(model, x, s.scope)) }));
    const a = pts[0]?.v ?? null, b = pts[pts.length - 1]?.v ?? null;
    const vals = pts.map((x) => x.v).filter((x): x is number => x !== null);
    const hi = pts.reduce((best, x) => ((x.v ?? -Infinity) > (best.v ?? -Infinity) ? x : best), pts[0]);
    return {
      intent: "trend",
      text: `${m.label} for ${s.label} ${verb(m, a, b)} from **${fmtV(m, a)}** on ${monthName(pts[0]?.m ?? from)} to **${fmtV(m, b)}** on ${monthName(pts[pts.length - 1]?.m ?? to)} (${fmtD(m, a, b) ?? "no comparison"}).\n\n` +
        `${pts.length > 14 ? "Last 14 days" : "Day by day"}: ${pts.slice(-14).map((x) => `${monthShort(x.m)} ${fmtV(m, x.v)}`).join(" · ")}.` +
        (vals.length > 2 ? `\n\nPeak: ${monthName(hi.m)} at ${fmtV(m, hi.v)}.` : ""),
      kpis: [kp(monthShort(from), fmtV(m, a)), kp(monthShort(to), fmtV(m, b), fmtD(m, a, b), toneD(m, a, b))],
      cta: { label: "Open Command Center", href: `/?month=${to}` },
    };
  }

  // ---- comparison: two months, or two scopes
  if (p.months.length >= 2 || scopes.length >= 2 || /\bvs\b|versus|compare|compared|against/.test(q)) {
    const out: string[] = [];
    const kpis: GenieKpi[] = [];
    if (p.months.length >= 2) {
      const [a, b] = [p.months[0], p.months[p.months.length - 1]];
      for (const s of scopes) for (const m of p.metrics) {
        const va = m.get(getSnapshot(model, a, s.scope)), vb = m.get(getSnapshot(model, b, s.scope));
        out.push(`**${m.label}** for ${s.label} ${verb(m, va, vb)} from **${fmtV(m, va)}** in ${monthName(a)} to **${fmtV(m, vb)}** in ${monthName(b)} (${fmtD(m, va, vb) ?? "n/a"}).`);
        kpis.push(kp(`${m.label} ${monthShort(b)}`, fmtV(m, vb), fmtD(m, va, vb), toneD(m, va, vb)));
      }
    } else {
      const cmpMonth = p.months[0] ?? ctx.month;
      const pm = prevMonth(model, cmpMonth);
      const list = scopes.length >= 2 ? scopes : [...scopes, { scope: null, label: "the portfolio" }];
      for (const m of p.metrics) {
        if (scopes.length < 2 && pm && !/\bvs\b|versus|compare/.test(q)) break;
        out.push(`**${m.label}, ${monthName(cmpMonth)}:** ${list.map((s) => `${s.label} **${fmtV(m, m.get(getSnapshot(model, cmpMonth, s.scope)))}**`).join(" vs ")}.`);
        list.forEach((s) => kpis.push(kp(`${scopeName(s.scope, "Portfolio")}`, fmtV(m, m.get(getSnapshot(model, cmpMonth, s.scope))))));
      }
      if (!out.length && pm) {
        for (const s of scopes) for (const m of p.metrics) {
          const va = m.get(getSnapshot(model, pm, s.scope)), vb = m.get(getSnapshot(model, cmpMonth, s.scope));
          out.push(`**${m.label}** for ${s.label}: **${fmtV(m, vb)}** in ${monthName(cmpMonth)} against ${fmtV(m, va)} in ${monthName(pm)} (${fmtD(m, va, vb) ?? "n/a"}).`);
          kpis.push(kp(m.label, fmtV(m, vb), fmtD(m, va, vb), toneD(m, va, vb)));
        }
      }
    }
    const sc = scopes[0].scope;
    const cta = sc ? { label: `Open ${scopeName(sc)} analysis`, href: analysisHref(sc.startsWith("ch:") ? { channel: scopeName(sc) } : { state: sc }, month) } : { label: "Open Command Center", href: `/?${q2}` };
    return { intent: "compare", text: out.join("\n\n"), kpis: kpis.slice(0, 4), cta };
  }

  // ---- single value(s)
  const pm = prevMonth(model, month);
  const lines: string[] = [];
  const kpis: GenieKpi[] = [];
  for (const s of scopes) {
    // State × Channel cross cell (drill month only)
    const cross = p.states.length && p.channels.length ? model.stateChannel.find((r) => r.state === p.states[0] && r.channel === p.channels[0]) : null;
    for (const m of p.metrics) {
      if (cross && month === model.drillMonth && s === scopes[0]) {
        const map: Record<string, number | null> = { sales: cross.sales, installs: cross.installs, cancels: cross.cancels, cancelRate: cross.cancelRate, post: cross.postPct, cust: cross.custPct, pending: cross.pendingPct };
        if (m.id in map) {
          lines.push(`**${m.label}** for ${cross.state} ${cross.channel} in ${M}: **${fmtV(m, map[m.id])}**.`);
          kpis.push(kp(`${cross.state} ${cross.channel}`, fmtV(m, map[m.id])));
          continue;
        }
      }
      const v = m.get(getSnapshot(model, month, s.scope));
      const pv = pm ? m.get(getSnapshot(model, pm, s.scope)) : null;
      lines.push(`**${m.label}** for ${s.label} in ${M}: **${fmtV(m, v)}**${pv !== null && v !== null ? ` (${fmtD(m, pv, v)} versus ${monthName(pm!)}, ${fmtV(m, pv)})` : ""}.`);
      kpis.push(kp(`${m.label}${scopes.length > 1 ? `, ${scopeName(s.scope)}` : ""}`, fmtV(m, v), fmtD(m, pv, v), toneD(m, pv, v)));
    }
    if (p.states.length && p.channels.length) break;
  }
  const first = scopes[0];
  return {
    intent: "value",
    text: lines.join("\n\n"),
    kpis: kpis.slice(0, 4),
    cta: first.scope ? { label: `Open ${scopeName(first.scope)} analysis`, href: analysisHref(first.scope.startsWith("ch:") ? { channel: scopeName(first.scope) } : { state: first.scope }, month) } : { label: "Open Command Center", href: `/?${q2}` },
    followUps: [`How did ${p.metrics[0].label.toLowerCase()} change since January?`, `Break down ${M} ${p.metrics[0].label.toLowerCase()} by state`],
  };
}

function insightAnswer(ctx: GenieContext): GenieAnswer {
  const { model, month } = ctx;
  const ins = buildInsights(model, month).slice(0, 4);
  const st = [...stateRows(model, month)].sort((a, b) => (b.cancelsMoM ?? -1) - (a.cancelsMoM ?? -1));
  const ch = [...channelRows(model, month)].sort((a, b) => (b.cancelsMoM ?? -1) - (a.cancelsMoM ?? -1));
  const movers = [
    st[0] && `Biggest state mover: **${st[0].state}** (cancellations ${fmtSignedPct(st[0].cancelsMoM)})`,
    ch[0] && `Biggest channel mover: **${ch[0].channel}** (cancellations ${fmtSignedPct(ch[0].cancelsMoM)})`,
  ].filter(Boolean);
  return {
    intent: "insights",
    text: `**Key insights for ${monthName(month)}:**\n\n${ins.map((i, n) => `${n + 1}. **${i.title}.** ${i.insight}`).join("\n")}\n\n${movers.join("\n")}`,
    kpis: ins.slice(0, 4).map((i) => kp(i.metric.label, i.metric.value, i.metric.delta, i.metric.tone)),
    cta: { label: "Open Insights", href: `/insights?month=${month}` },
    followUps: ["What should Brightspeed do next?", "Which state is driving the increase?"],
  };
}

// ------------------------------------------------------------------ narrative handlers
const has = (q: string, re: RegExp) => re.test(q);

export const ruleBasedProvider: AnswerProvider = {
  answer(question, ctx) {
    const { model } = ctx;
    const month = ctx.month;
    const M = monthName(month);
    const q = question.toLowerCase().trim();
    if (!q) return help(model, month);
    const narrative = has(q, /\bwhy\b|what should|recommend|next step|do next|could we|predict|see it coming|driving|driver|root cause|what happened|mostly|explain|is the action working/);
    if (!narrative) {
      const a = dataAnswer(question, ctx);
      if (a) return a;
    }

    const p = parse(question, model, month);
    const st = p.states[0] ?? null;
    const scopeSt = st ?? (p.channels[0] ? chScope(p.channels[0]) : ctx.state);
    const d = diagnose(model, month);
    const cur = getSnapshot(model, month, null);
    const pm = prevMonth(model, month);
    const q2 = `month=${month}`;

    // ---- what should we do
    if (has(q, /what should|do next|recommend|next step|action|is the action working|fix/)) {
      const acts = buildActions(model, month);
      const top = acts.slice(0, 3);
      return {
        intent: "actions",
        text:
          `The recommended priorities for ${M} are:\n\n${top.map((a, i) => `${i + 1}. **${a.title}** (${a.owner}, ${a.priority.toLowerCase()} priority, ${a.market}). ${a.impact}`).join("\n")}\n\n` +
          `Progress is measured by a reduction in Post ODD share, Pending Customer Contact and the late stage Customer Miss reasons. Each action can be initiated from the Actions page, which drafts the email to its owner.`,
        kpis: top.filter((a) => a.population !== null).map((a) => kp(a.title, fmtInt(a.population), a.populationLabel)).slice(0, 2),
        cta: { label: "Open Actions", href: `/actions?${q2}` },
        followUps: ["Could we have predicted these cancellations?", "What is driving Customer Miss?"],
      };
    }

    // ---- watchtower / predictability
    if (has(q, /watchtower|signal|predict|see it coming|saw it coming|early warning|foresee|leading|prevent|avoid|could we/)) {
      const sig = watchSignals(model, month, scopeSt);
      const ranked = sig.filter((s) => s.actionable && s.pct !== null).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
      const top = ranked[0];
      const where = scopeName(scopeSt, "the portfolio");
      if (!top) return { intent: "watchtower", text: `Watchtower signal data is not available for ${where} in ${M}.`, kpis: [], cta: { label: "Open Watchtower", href: `/watchtower?${q2}` } };
      const flagged = sig.filter((s) => s.actionable).reduce((a, s) => a + (s.pct ?? 0), 0);
      const pending = sig.find((s) => s.id === "pending")!, bsw = sig.find((s) => s.id === "bsw")!, jeo = sig.find((s) => s.id === "jeopardy")!;
      return {
        intent: "watchtower",
        text:
          `**${top.label}** is the most significant warning signal for ${where} in ${M}: **${fmtPct0(top.pct)}** of cancellations carried it before they occurred` +
          `${top.count !== null ? ` (approximately ${fmtInt(top.count)} orders)` : ""}. In total, **${fmtPct0(flagged)}** of cancellations had a Watchtower warning.\n\n` +
          `Technical risk is considerably smaller (Install in Jeopardy ${fmtPct0(jeo.pct)}, BSW Delay Predicted ${fmtPct0(bsw.pct)}), so the early warning points to customer engagement rather than network readiness. Pending Customer Contact is a practical outreach trigger.`,
        kpis: [kp("Pending Customer Contact", fmtPct0(pending.pct), pending.count !== null ? `${fmtInt(pending.count)} orders` : undefined, "bad"), kp("Install in Jeopardy", fmtPct0(jeo.pct)), kp("BSW Delay Predicted", fmtPct0(bsw.pct))],
        cta: { label: "Open Watchtower", href: `/watchtower?${q2}${st ? `&state=${stateSlug(st)}` : ""}` },
        followUps: ["What should Brightspeed do next?"],
      };
    }

    // ---- which state / channel is driving
    if (has(q, /which (state|market|channel)|hotspot|most affected|where/) && !has(q, /lifecycle/)) {
      if (has(q, /channel/)) {
        const rows = [...channelRows(model, month)].sort((a, b) => (b.contribution ?? -1) - (a.contribution ?? -1));
        const top = rows[0];
        if (top) return {
          intent: "top-channel",
          text: `**${top.channel}** is the focus channel in ${M}: cancellations ${fmtSignedPct(top.cancelsMoM)} (${fmtInt(top.cancels)} orders, ${fmtPct(top.cancelRate)} cancel rate), **${fmtPct0(top.contribution)}** of the portfolio increase.\n\nBy growth: ${[...rows].sort((a, b) => (b.cancelsMoM ?? -1) - (a.cancelsMoM ?? -1)).map((r) => `${r.channel} ${fmtSignedPct(r.cancelsMoM)}`).join(" · ")}.`,
          kpis: [kp(`${top.channel} cancellations`, fmtInt(top.cancels), fmtSignedPct(top.cancelsMoM), "bad"), kp("Cancel rate", fmtPct(top.cancelRate)), kp("Share of increase", fmtPct0(top.contribution))],
          cta: { label: `Open ${top.channel} analysis`, href: analysisHref({ channel: top.channel }, month) },
        };
      }
      const rows = [...stateRows(model, month)].sort((a, b) => (b.cancelsMoM ?? -1) - (a.cancelsMoM ?? -1));
      const top = rows[0];
      return {
        intent: "top-state",
        text:
          `**${top.state}** is the principal driver of the ${M} change: cancellations ${fmtSignedPct(top.cancelsMoM)} versus ${monthName(pm ?? month)} (${fmtInt(top.cancels)} orders, ${fmtPct(top.cancelRate)} cancel rate)` +
          `${top.contribution !== null ? `, **${fmtPct0(top.contribution)}** of the portfolio increase` : ""}.\n\n` +
          `Ranking by growth: ${rows.map((r) => `${r.state} ${fmtSignedPct(r.cancelsMoM)}`).join(" · ")}.` +
          (d.focusChannel ? `\n\nFocus channel: **${d.focusChannel.channel}** (${fmtPct0(d.focusChannel.contribution)} of the cancellations above normal).` : ""),
        kpis: [kp(`${top.state} cancellations`, fmtInt(top.cancels), fmtSignedPct(top.cancelsMoM), "bad"), kp("Post ODD", fmtPct0(top.postPct)), kp("Pending contact", fmtPct0(top.pendingPct))],
        cta: { label: `Open ${top.state} analysis`, href: analysisHref({ state: top.state }, month) },
        followUps: [`Why is ${top.state} performing poorly?`, "Which channel is driving the increase?"],
      };
    }

    // ---- specific state or channel story
    if ((st || p.channels.length) && !has(q, /customer miss|no access|reschedul|buyer|tech on job|post.?odd|pre.?odd/)) {
      const scope = st ?? chScope(p.channels[0]);
      const name = scopeName(scope);
      const s = getSnapshot(model, month, scope);
      const pv = pm ? getSnapshot(model, pm, scope) : null;
      const mom = s.cancels !== null && pv?.cancels ? s.cancels / pv.cancels - 1 : null;
      const late = st ? reasonStats(model, month, st).filter((r) => r.lateStage && (r.mom ?? 0) > 0.25) : [];
      return {
        intent: "scope",
        text:
          `**${name}** in ${M}: ${fmtInt(s.cancels)} cancellations on ${fmtInt(s.sales)} sales, a **${fmtPct(s.cancelRate)}** cancel rate${mom !== null ? `, ${fmtSignedPct(mom)} versus ${monthName(pm!)}` : ""}.\n\n` +
          `Post ODD is **${fmtPct0(s.postPct)}** of its cancellations, Customer Miss **${fmtPct0(s.custPct)}**${s.pendingPct !== null ? ` and Pending Customer Contact **${fmtPct0(s.pendingPct)}**` : ""}. ` +
          (late.length ? `Fastest growing reasons: ${late.map((r) => `${r.label} (${fmtSignedPct(r.mom)})`).join(", ")}.` : ""),
        kpis: [kp("Cancellations", fmtInt(s.cancels), mom !== null ? fmtSignedPct(mom) : undefined, (mom ?? 0) > 0 ? "bad" : "good"), kp("Cancel rate", fmtPct(s.cancelRate)), kp("Post ODD", fmtPct0(s.postPct)), kp("Pending contact", fmtPct0(s.pendingPct))],
        cta: { label: `Open ${name} analysis`, href: analysisHref(st ? { state: name } : { channel: name }, month) },
        followUps: st ? [`What is driving Customer Miss in ${st}?`, "What should Brightspeed do next?"] : ["What should Brightspeed do next?"],
      };
    }

    // ---- ODD timing
    if (has(q, /\bodd\b|timing|pre or post|before.*due|after.*due/)) {
      const s = getSnapshot(model, month, scopeSt);
      const pv = pm ? getSnapshot(model, pm, scopeSt) : null;
      const dom = ([["Pre ODD", s.prePct], ["On ODD", s.onPct], ["Post ODD", s.postPct]] as [string, number | null][]).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
      const trend = series(model, "postPct", scopeSt).filter((x) => x.value !== null && x.month <= month).map((x) => `${monthShort(x.month)} ${fmtPct0(x.value)}`);
      return {
        intent: "timing",
        text:
          `In ${M}, **${dom[0]}** is the largest timing bucket for ${scopeName(scopeSt, "the portfolio")}: Pre ODD ${fmtPct0(s.prePct)}, On ODD ${fmtPct0(s.onPct)}, Post ODD ${fmtPct0(s.postPct)}` +
          `${pv ? ` (Post ODD was ${fmtPct0(pv.postPct)} in ${monthName(pm!)})` : ""}.\n\nPost ODD trend: ${trend.join(" · ")}.`,
        kpis: [kp("Pre ODD", fmtPct0(s.prePct)), kp("On ODD", fmtPct0(s.onPct)), kp("Post ODD", fmtPct0(s.postPct), pv ? fmtPp((s.postPct ?? 0) - (pv.postPct ?? 0)) : undefined, (s.postPct ?? 0) > (pv?.postPct ?? 1) ? "bad" : "good")],
        cta: { label: "Open timing analysis", href: `/cancellations?tab=timing&${q2}` },
        followUps: ["What is driving Customer Miss?"],
      };
    }

    // ---- customer miss drivers
    if (has(q, /customer miss|no access|not home|reschedul|buyer|tech on job|why are customers|reasons?|driving customer/)) {
      const scope = st ?? (ctx.state && !ctx.state.startsWith("ch:") ? ctx.state : null);
      const rs = reasonStats(model, month, scope);
      const s = getSnapshot(model, month, scope);
      const fast = [...rs].filter((r) => r.mom !== null).sort((a, b) => (b.mom ?? 0) - (a.mom ?? 0)).slice(0, 3);
      return {
        intent: "customer-miss",
        text:
          `**Customer Miss** represents **${fmtPct0(s.custPct)}** of cancellations (${fmtInt(s.custMiss)}) ${scope ? `in ${scope}` : "across the portfolio"} in ${M}.\n\n` +
          `Largest reasons: ${rs.slice(0, 3).map((r) => `${r.label} ${fmtInt(r.count)}`).join(", ")}. Fastest growing: ${fast.map((r) => `${r.label} ${fmtSignedPct(r.mom)}`).join(", ")}. ` +
          `${fast.some((r) => r.lateStage) ? "This is a late stage appointment readiness pattern: customers unavailable, rescheduling, or cancelling with the technician on site." : "No clear late stage pattern is present."}`,
        kpis: fast.map((r) => kp(r.label, fmtInt(r.count), fmtSignedPct(r.mom), (r.mom ?? 0) > 0 ? "bad" : "good")),
        cta: { label: "Review Customer Miss", href: `/cancellations?tab=miss&${q2}${scope ? `&state=${stateSlug(scope)}` : ""}` },
        followUps: ["Could we have predicted these cancellations?"],
      };
    }

    // ---- why / summary
    if (has(q, /why|increase|rise|rose|spike|driv|cause|explain|what happened|summary|overview|happening/)) {
      const story = buildExecutiveNarrative(model, month);
      return {
        intent: "why",
        text: [`**${story.headline}**`, ...story.points.map((p) => p.text)].join("\n\n"),
        kpis: [
          kp("Cancellations", fmtInt(cur.cancels), fmtSignedPct(d.cancelsMoM), (d.cancelsMoM ?? 0) > 0 ? "bad" : "good"),
          kp("Unique Sales", fmtInt(cur.sales), fmtSignedPct(d.salesMoM), (d.salesMoM ?? 0) >= 0 ? "good" : "bad"),
          kp("Cancel rate", fmtPct(cur.cancelRate), pm ? fmtPp((cur.cancelRate ?? 0) - (getSnapshot(model, pm, null).cancelRate ?? 0), 1) : undefined, (cur.cancelRate ?? 0) > (d.prevCancelRate ?? 1) ? "bad" : "good"),
        ],
        cta: { label: "Explore cancellations", href: `/cancellations?${q2}` },
        followUps: ["Which state is driving the increase?", "Which channel is driving the increase?"],
      };
    }

    // ---- workbook's executive questions
    const words = new Set(q.split(/\W+/).filter((w) => w.length > 3));
    let best: { score: number; row: DataModel["executiveQuestions"][number] } | null = null;
    for (const row of model.executiveQuestions) {
      const score = row.question.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && words.has(w)).length;
      if (score > 0 && (!best || score > best.score)) best = { score, row };
    }
    if (best) {
      return {
        intent: "exec-question",
        text: `${best.row.answer}\n\n**Evidence:** ${best.row.evidence}\n\n**Next step:** ${best.row.nextStep}`,
        kpis: [], cta: { label: "Open Insights", href: `/insights?${q2}` },
      };
    }
    return help(model, month);
  },
};

function help(model: DataModel, month: MonthKey): GenieAnswer {
  return {
    intent: "help",
    text: "I answer directly from the workbook data. You can ask for a **value** (“cancels this week”), a **comparison** (“cancel rate this week vs last week”), a **ranking** (“which channel has the highest cancel rate”), a **trend** (“Post ODD share trend”), a **breakdown** (“cancellations by state”), or **insights** and **recommended actions**.",
    kpis: [], followUps: suggestedQuestions(model, month).slice(0, 4),
  };
}

