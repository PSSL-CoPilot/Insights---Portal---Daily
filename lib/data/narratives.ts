/**
 * Data-driven storytelling: executive summary, diagnosis, insights and recommended actions.
 * All numbers are read from the workbook-backed model at call time. Text templates only choose
 * *which* sentences apply based on what the data shows.
 */
import type { DataModel, MonthKey } from "./types";
import {
  AGENCY_GAP_THRESHOLD, assess, findFocusChannel, findHotspot, getSnapshot, isChannel, kpiById, kpiDelta, nk, normalRate, prevMonth, reasonStats, scopeName, stateRows, excessCancels,
  type ChannelRow, type StateRow, REASON_LABELS,
} from "./metrics";
import { fmtInt, fmtPct, fmtPct0, fmtPp, fmtSignedPct, monthLabel, monthName, monthShort, stateSlug } from "../format";
import { analysisHref } from "../story/links";

export type RootCause = "customer-readiness" | "operational" | "mixed" | "stable" | "insufficient";

export interface Diagnosis {
  month: MonthKey;
  prev: MonthKey | null;
  cancelsMoM: number | null;
  salesMoM: number | null;
  installsMoM: number | null;
  anomaly: boolean;
  cancelRate: number | null;
  prevCancelRate: number | null;
  postPct: number | null;
  prevPostPct: number | null;
  postCancels: number | null;
  prevPostCancels: number | null;
  custPct: number | null;
  dominantClass: { label: string; pct: number } | null;
  pendingPct: number | null;
  pendingDelta: number | null;
  bswPct: number | null;
  jeopardyPct: number | null;
  hotspot: StateRow | null;
  runnerUpGrowth: number | null;
  focusChannel: ChannelRow | null;
  lateDrivers: { label: string; count: number; mom: number }[];
  excess: ReturnType<typeof excessCancels>;
  rootCause: RootCause;
}

export function diagnose(model: DataModel, month: MonthKey): Diagnosis {
  const prev = prevMonth(model, month);
  const cur = getSnapshot(model, month, null);
  const pv = prev ? getSnapshot(model, prev, null) : null;
  const rel = (a: number | null, b: number | null | undefined) => (a !== null && b ? a / b - 1 : null);
  const cancelsDef = kpiById("cancels")!;
  // Day-wise: an exception is a cancel rate clearly above its usual level, whatever the change against the previous period.
  const normal = normalRate(model, null);
  const anomaly = model.daily ? normal !== null && (cur.cancelRate ?? 0) - normal >= 0.01 : assess(model, cancelsDef, month, null).anomaly && (kpiDelta(model, cancelsDef, month, null)?.value ?? 0) > 0;

  const hotspot = findHotspot(model, month);
  const others = stateRows(model, month).filter((r) => r.state !== hotspot?.state).map((r) => r.cancelsMoM).filter((x): x is number => x !== null);

  const classes = [
    { label: "Customer Miss", pct: cur.custPct },
    { label: "Company Miss", pct: cur.coPct },
    { label: "Faux Cancel", pct: cur.fauxPct },
  ].filter((c): c is { label: string; pct: number } => c.pct !== null).sort((a, b) => b.pct - a.pct);

  const lateDrivers = reasonStats(model, month, null)
    .filter((r) => r.mom !== null && r.count !== null && r.mom > 0.25)
    .sort((a, b) => (b.mom ?? 0) - (a.mom ?? 0))
    .slice(0, 3)
    .map((r) => ({ label: r.label, count: r.count as number, mom: r.mom as number }));

  const pendingDelta = cur.pendingPct !== null && pv?.pendingPct != null ? cur.pendingPct - pv.pendingPct : null;
  const bswDelta = cur.bswPct !== null && pv?.bswPct != null ? cur.bswPct - pv.bswPct : null;
  const jeoDelta = cur.jeopardyPct !== null && pv?.jeopardyPct != null ? cur.jeopardyPct - pv.jeopardyPct : null;
  const postShift = cur.postPct !== null && pv?.postPct != null ? cur.postPct - pv.postPct : null;
  const coDelta = cur.coPct !== null && pv?.coPct != null ? cur.coPct - pv.coPct : null;

  let rootCause: RootCause = "insufficient";
  if (!prev) rootCause = "insufficient";
  else if (!anomaly) rootCause = "stable";
  else {
    const customerLed = (cur.custPct ?? 0) >= 0.5 && (pendingDelta ?? 0) > 0 && (pendingDelta ?? 0) > Math.max(bswDelta ?? 0, jeoDelta ?? 0, 0) && (postShift ?? 0) > 0;
    const opsLed = (bswDelta ?? 0) > 0.02 || (jeoDelta ?? 0) > 0.02 || (coDelta ?? 0) > 0.03;
    rootCause = customerLed && !opsLed ? "customer-readiness" : opsLed && !customerLed ? "operational" : "mixed";
  }

  return {
    month, prev,
    cancelsMoM: rel(cur.cancels, pv?.cancels), salesMoM: rel(cur.sales, pv?.sales), installsMoM: rel(cur.installs, pv?.installs),
    anomaly, cancelRate: cur.cancelRate, prevCancelRate: pv?.cancelRate ?? null,
    postPct: cur.postPct, prevPostPct: pv?.postPct ?? null, postCancels: cur.postCancels, prevPostCancels: pv?.postCancels ?? null,
    custPct: cur.custPct, dominantClass: classes[0] ?? null,
    pendingPct: cur.pendingPct, pendingDelta, bswPct: cur.bswPct, jeopardyPct: cur.jeopardyPct,
    hotspot, runnerUpGrowth: others.length ? Math.max(...others) : null, focusChannel: findFocusChannel(model, month), lateDrivers,
    excess: excessCancels(model, month), rootCause,
  };
}

const shortReason = (l: string) => (nk(l) === nk(REASON_LABELS.resched) ? "Customer Reschedules" : l);
const abs = (s: string) => s.replace(/^[+−]/, "");

// ------------------------------------------------------------------ focus insight (Cancellations page)
export type FocusKind = "timing" | "miss" | "class";

export interface FocusInsight {
  title: string;
  text: string;
  focusState: string | null;
  focusChannel: string | null;
  /** States ranked by the tab's focus measure. */
  ranked: { state: string; value: number | null; growth: number | null; share: number | null }[];
  valueLabel: string;
  unit: "count" | "pct";
}

export function focusInsight(model: DataModel, month: MonthKey, kind: FocusKind): FocusInsight {
  const pm = prevMonth(model, month);
  const key = kind === "timing" ? "postCancels" : kind === "miss" ? "custMiss" : "custPct";
  const label = kind === "timing" ? "Post ODD cancellations" : kind === "miss" ? "Customer Miss cancellations" : "Customer Miss share";
  const port = getSnapshot(model, month, null);
  const portPrev = pm ? getSnapshot(model, pm, null) : null;
  const portInc = kind === "class" ? null : (port[key] ?? 0) - (portPrev?.[key] ?? 0);
  const ranked = model.states
    .map((st) => {
      const s = getSnapshot(model, month, st), p = pm ? getSnapshot(model, pm, st) : null;
      const v = s[key] ?? null, pv = p?.[key] ?? null;
      const growth = v !== null && pv ? (kind === "class" ? v - pv : v / pv - 1) : null;
      return { state: st, value: v, growth, share: portInc && v !== null && pv !== null ? (v - pv) / portInc : null };
    })
    .sort((a, b) => (b.growth ?? -Infinity) - (a.growth ?? -Infinity));
  const top = ranked[0];
  const chs = model.channelNames.map((c) => {
    const s = getSnapshot(model, month, `ch:${c}`), p = pm ? getSnapshot(model, pm, `ch:${c}`) : null;
    const v = s[key] ?? null, pv = p?.[key] ?? null;
    return { c, growth: v !== null && pv ? (kind === "class" ? v - pv : v / pv - 1) : null };
  }).sort((a, b) => (b.growth ?? -Infinity) - (a.growth ?? -Infinity));
  const topCh = chs[0] && (chs[0].growth ?? 0) > (kind === "class" ? 0.02 : 0.15) ? chs[0] : null;
  const g = (x: number | null) => (kind === "class" ? fmtPp(x) : fmtSignedPct(x));
  const focusState = top && (top.growth ?? 0) > (kind === "class" ? 0.02 : 0.15) ? top.state : null;
  const M = monthName(month);

  let text: string;
  if (!pm) text = model.daily ? `No earlier period of the same length is available for ${M}, so a ranking by change is not available.` : `${M} is the first month in the dataset; a ranking by change is not yet available.`;
  else if (!focusState) text = `${label} moved within the normal range in every state in ${M}. No focus state is required this period.`;
  else {
    const rest = ranked.slice(1).map((r) => r.growth).filter((x): x is number => x !== null);
    text =
      `**${focusState}** is the focus state: ${label} ${kind === "class" ? "moved" : "changed"} ${g(top.growth)} in ${M}` +
      `${top.share !== null ? `, accounting for **${fmtPct0(top.share)}** of the portfolio increase` : ""}. ` +
      `${rest.length ? `All other states ranged from ${g(Math.min(...rest))} to ${g(Math.max(...rest))}. ` : ""}` +
      (topCh ? `By channel, **${topCh.c}** shows the sharpest movement (${g(topCh.growth)}) and is the focus channel.` : "No single channel stands out.");
  }
  return {
    title: kind === "timing" ? "Where is Post ODD growth concentrated?" : kind === "miss" ? "Where is Customer Miss growth concentrated?" : "Where is the Customer Miss share rising?",
    text, focusState, focusChannel: topCh?.c ?? null, ranked, valueLabel: label, unit: kind === "class" ? "pct" : "count",
  };
}

// ------------------------------------------------------------------ insights
export type Severity = "critical" | "high" | "medium" | "low";

export interface Insight {
  id: string;
  severity: Severity;
  metric: { label: string; value: string; delta?: string; tone?: "bad" | "good" };
  title: string;
  insight: string;
  evidence: string[];
  action: string;
  explore: { label: string; href: string };
}

const sevRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function buildInsights(model: DataModel, month: MonthKey): Insight[] {
  const d = diagnose(model, month);
  const out: Insight[] = [];
  if (!d.prev) return out;
  const cur = getSnapshot(model, month, null);
  const pv = getSnapshot(model, d.prev, null);
  const M = monthName(month);
  const hot = d.hotspot;
  const q = `month=${month}`;

  if (d.cancelsMoM !== null) {
    out.push({
      id: "cancel-mom",
      severity: d.anomaly ? "critical" : "low",
      metric: { label: "Total cancellations", value: fmtInt(cur.cancels), delta: fmtSignedPct(d.cancelsMoM), tone: d.cancelsMoM > 0 ? "bad" : "good" },
      title: d.anomaly ? `${M} cancellations increased ${abs(fmtSignedPct(d.cancelsMoM))} vs the previous period` : `${M} cancellations are within the normal range (${fmtSignedPct(d.cancelsMoM)})`,
      insight: d.anomaly
        ? `The movement is well outside the typical monthly change of about ${fmtPct(assess(model, kpiById("cancels")!, month, null).baseline, 0)} observed earlier in the year, while sales moved ${fmtSignedPct(d.salesMoM)}.`
        : `Cancellations are tracking sales growth (${fmtSignedPct(d.salesMoM)}); no intervention is indicated.`,
      evidence: [
        `Cancellations ${fmtInt(pv.cancels)} to ${fmtInt(cur.cancels)}; sales ${fmtInt(pv.sales)} to ${fmtInt(cur.sales)}`,
        `Cancel rate ${fmtPct(d.prevCancelRate)} to ${fmtPct(d.cancelRate)}`,
        ...(d.excess && d.anomaly ? [`Approximately ${fmtInt(Math.round(d.excess.excess))} cancellations above the ${fmtPct(d.excess.baselineRate)} baseline rate`] : []),
      ],
      action: d.anomaly ? "Review where in the lifecycle the increase occurs and which markets and channels drive it." : "Continue routine monitoring.",
      explore: { label: "Explore cancellations", href: `/cancellations?${q}` },
    });
  }

  if (hot && d.anomaly && hot.cancelsMoM !== null) {
    out.push({
      id: "hotspot",
      severity: "high",
      metric: { label: `${hot.state} cancellations`, value: fmtInt(hot.cancels), delta: fmtSignedPct(hot.cancelsMoM), tone: "bad" },
      title: `${hot.state} cancellations increased ${abs(fmtSignedPct(hot.cancelsMoM))}`,
      insight: `${hot.state} contributes ${fmtPct0(hot.contribution)} of the portfolio cancellation increase${d.runnerUpGrowth !== null ? `; the next highest state moved ${fmtSignedPct(d.runnerUpGrowth)}` : ""}.`,
      evidence: [
        `Cancel rate ${fmtPct(hot.cancelRate)}; Post ODD ${fmtPct0(hot.postPct)}; Customer Miss ${fmtPct0(hot.custPct)}`,
        ...(hot.pendingPct !== null ? [`Pending Customer Contact ${fmtPct0(hot.pendingPct)}`] : []),
      ],
      action: `Prioritise ${hot.state} appointment readiness actions before any footprint wide change.`,
      explore: { label: `Open ${hot.state} analysis`, href: analysisHref({ state: hot.state }, month) },
    });
  }

  const fc = d.focusChannel;
  if (fc && d.anomaly && (fc.contribution ?? 0) > 0.25) {
    out.push({
      id: "channel",
      severity: "high",
      metric: { label: `${fc.channel} cancellations`, value: fmtInt(fc.cancels), delta: fmtSignedPct(fc.cancelsMoM), tone: "bad" },
      title: `${fc.channel} is the focus channel`,
      insight: `${fc.channel} accounts for ${fmtPct0(fc.contribution)} of the cancellation increase at a ${fmtPct(fc.cancelRate)} cancel rate; the remaining channels moved considerably less.`,
      evidence: [`Post ODD ${fmtPct0(fc.postPct)}; Customer Miss ${fmtPct0(fc.custPct)}; Pending Customer Contact ${fmtPct0(fc.pendingPct)}`],
      action: `Review ${fc.channel} order quality and expectation setting at the point of sale.`,
      explore: { label: `Open ${fc.channel} analysis`, href: analysisHref({ channel: fc.channel }, month) },
    });
  }

  if (d.postPct !== null && d.prevPostPct !== null) {
    const shift = d.postPct - d.prevPostPct;
    if (Math.abs(shift) >= 0.03) {
      out.push({
        id: "post-odd",
        severity: shift > 0 ? "high" : "low",
        metric: { label: "Post ODD share", value: fmtPct0(d.postPct), delta: fmtPp(shift), tone: shift > 0 ? "bad" : "good" },
        title: `Post ODD cancellations ${shift > 0 ? "increased" : "decreased"} from ${fmtPct0(d.prevPostPct)} to ${fmtPct0(d.postPct)}`,
        insight: shift > 0 ? "Customers are increasingly lost late in the order lifecycle, after the committed date has passed." : "The mix is moving toward earlier cancellations.",
        evidence: [
          `Post ODD cancellations ${fmtInt(d.prevPostCancels)} to ${fmtInt(d.postCancels)}${d.postCancels !== null && d.prevPostCancels ? ` (${fmtSignedPct(d.postCancels / d.prevPostCancels - 1)})` : ""}`,
          `Pre ODD share ${fmtPct0(pv.prePct)} to ${fmtPct0(cur.prePct)}; On ODD ${fmtPct0(pv.onPct)} to ${fmtPct0(cur.onPct)}`,
        ],
        action: "Focus on late stage appointment and customer contact breakdowns.",
        explore: { label: "Explore timing", href: `/cancellations?tab=timing&${q}` },
      });
    }
  }

  if (d.pendingPct !== null && d.pendingDelta !== null && d.pendingDelta > 0.02) {
    const a = assess(model, kpiById("pending")!, month, null);
    out.push({
      id: "pending",
      severity: a.anomaly ? "medium" : "low",
      metric: { label: "Pending Customer Contact", value: fmtPct0(d.pendingPct), delta: fmtPp(d.pendingDelta), tone: "bad" },
      title: `Pending Customer Contact increased materially (${fmtPct0(pv.pendingPct)} to ${fmtPct0(d.pendingPct)})`,
      insight: "Unresolved customer contact is the strongest early warning signal and is visible before the cancellation occurs.",
      evidence: [
        `Install in Jeopardy ${fmtPct0(d.jeopardyPct)} and BSW Delay Predicted ${fmtPct0(d.bswPct)} remain low by comparison`,
        `Approximately ${fmtInt(Math.round(d.pendingPct * (cur.cancels ?? 0)))} ${M} cancellations carried this signal`,
      ],
      action: "Use Pending Customer Contact as the trigger for proactive outreach.",
      explore: { label: "Explore Watchtower", href: `/watchtower?${q}` },
    });
  }

  const late = reasonStats(model, month, null).filter((r) => r.lateStage && r.mom !== null && r.mom > 0.25);
  if (late.length) {
    out.push({
      id: "late-drivers",
      severity: "medium",
      metric: { label: "Late stage Customer Miss", value: fmtInt(late.reduce((a, r) => a + (r.count ?? 0), 0)), tone: "bad" },
      title: `${late.map((r) => shortReason(r.label)).join(", ")} increased sharply`,
      insight: "These reasons describe customers who are not ready or available at the appointment: an engagement issue rather than a build issue.",
      evidence: late.map((r) => `${r.label}: ${fmtInt(r.prevCount)} to ${fmtInt(r.count)} (${fmtSignedPct(r.mom)})`),
      action: "Introduce confirmation and guided rebooking ahead of the technician visit.",
      explore: { label: "Review Customer Miss", href: `/cancellations?tab=miss&${q}` },
    });
  }

  if (d.anomaly && d.rootCause === "customer-readiness") {
    out.push({
      id: "not-bsw",
      severity: "low",
      metric: { label: "BSW Delay Predicted", value: fmtPct0(d.bswPct) },
      title: "Network and BSW readiness are not the driver",
      insight: "Predictive BSW and jeopardy signals stayed low while customer contact signals rose, which rules out a broad network readiness issue.",
      evidence: [`Install in Jeopardy ${fmtPct0(d.jeopardyPct)}; Company Miss ${fmtPct0(cur.coPct)} (${fmtPct0(pv.coPct)} prior)`],
      action: "Maintain the current operational watch; no diversion of network capacity is required.",
      explore: { label: "Explore Watchtower", href: `/watchtower?${q}` },
    });
  }

  return out.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
}

// ------------------------------------------------------------------ actions
export type Priority = "Critical" | "High" | "Medium" | "Low";

export interface ActionItem {
  id: string;
  title: string;
  owner: string;
  ownerEmail: string;
  priority: Priority;
  market: string;
  population: number | null;
  populationLabel: string;
  impact: string;
  why: string;
  evidence: string[];
  request: string;
  measures: string[];
  href: string;
  hrefLabel: string;
  /** Potential saves from the prevention plan for this layer, when the workbook provides it. */
  saves?: number | null;
}

/** Task owner mailboxes. Edit here to route initiated actions to the right teams. */
export const OWNER_EMAILS: Record<string, string> = {
  "Customer Operations": "customer.operations@brightspeed.com",
  "Customer Care": "customer.care@brightspeed.com",
  "D2D Sales Leadership": "d2d.sales@brightspeed.com",
  "Field Operations": "field.operations@brightspeed.com",
  "Insights and BI": "insights.bi@brightspeed.com",
  "Network Operations": "network.operations@brightspeed.com",
  "Sales Quality Assurance": "sales.quality@brightspeed.com",
  "Installation Planning": "installation.planning@brightspeed.com",
};

export function buildActions(model: DataModel, month: MonthKey): ActionItem[] {
  const d = diagnose(model, month);
  const hot = d.hotspot;
  const market = hot && d.anomaly ? hot.state : "All markets";
  const scope = hot && d.anomaly ? hot.state : null;
  const s = getSnapshot(model, month, scope);
  const port = getSnapshot(model, month, null);
  const r = (k: keyof typeof REASON_LABELS) => s[`reason:${nk(REASON_LABELS[k])}`] ?? null;
  const pendingPop = s.pendingPct !== null && s.cancels !== null ? Math.round(s.pendingPct * s.cancels) : null;
  const fc = d.focusChannel && (d.focusChannel.contribution ?? 0) > 0.25 ? d.focusChannel : null;
  const fcSc = fc && scope ? model.stateChannel.find((x) => x.state === scope && x.channel === fc.channel) : null;
  const q = `month=${month}`;
  const where = scope ?? "the portfolio";
  const P = (hi: Priority, lo: Priority): Priority => (d.anomaly ? hi : lo);
  const own = (o: string) => ({ owner: o, ownerEmail: OWNER_EMAILS[o] ?? "" });

  const list: ActionItem[] = [
    {
      id: "confirm", title: "Appointment Confirmation Outreach", ...own("Customer Operations"), priority: P("Critical", "Medium"), market,
      population: pendingPop, populationLabel: `${monthShort(month)} cancellations that carried Pending Customer Contact`,
      impact: "Convert unresolved customer contact into a confirmed appointment before the Original Due Date.",
      why: `Pending Customer Contact reached ${fmtPct0(s.pendingPct)} in ${where}, against ${fmtPct0(port.pendingPct)} for the portfolio.`,
      evidence: [
        `Pending Customer Contact ${fmtPct0(s.pendingPct)} of ${where} cancellations`,
        `Post ODD share ${fmtPct0(s.postPct)} of ${fmtInt(s.cancels)} cancellations`,
        `Install in Jeopardy ${fmtPct0(s.jeopardyPct)} and BSW Delay Predicted ${fmtPct0(s.bswPct)}, confirming a customer readiness driver`,
      ],
      request: "Trigger SMS and email confirmation 48 hours before every appointment where Watchtower shows Pending Customer Contact, with an agent call if there is no response within 24 hours.",
      measures: ["Pending Customer Contact share", "Post ODD cancellation share", "No Access / Not Home cancellations"],
      href: `/watchtower?${q}`, hrefLabel: "Open Watchtower",
    },
    {
      id: "reschedule", title: "Guided Rebooking for Reschedules", ...own("Customer Care"), priority: P("High", "Medium"), market,
      population: r("resched"), populationLabel: `Reschedule driven cancellations (${monthName(month)})`,
      impact: "Prevent repeat reschedules from ending in cancellation through guided rebooking and agent follow up on the second request.",
      why: `Customer Requested Reschedule is among the fastest growing Customer Miss reasons in ${where}.`,
      evidence: reasonStats(model, month, scope).filter((x) => x.lateStage).map((x) => (x.prevCount === null || x.mom === null ? `${x.label}: ${fmtInt(x.count)}` : `${x.label}: ${fmtInt(x.prevCount)} to ${fmtInt(x.count)} (${fmtSignedPct(x.mom)})`)),
      request: "Route every second reschedule request to a dedicated agent queue and offer the earliest available slot during the same interaction.",
      measures: ["Customer Requested Reschedule cancellations", "Share of reschedules rebooked within 7 days"],
      href: `/cancellations?tab=miss&${q}${scope ? `&state=${stateSlug(scope)}` : ""}`, hrefLabel: "Review Customer Miss",
    },
    ...(fc
      ? [{
          id: "channel", title: `${fc.channel} Order Quality and Expectation Setting`, ...own(fc.channel === "D2D" ? "D2D Sales Leadership" : "Customer Operations"), priority: P("High", "Medium"),
          market: scope ? `${scope}, ${fc.channel}` : fc.channel,
          population: fcSc?.cancels ?? fc.cancels, populationLabel: `${scope ? `${scope} ` : ""}${fc.channel} cancellations (${monthShort(month)})`,
          impact: "Improve install readiness at the point of sale: confirmed contact details, access information and customer availability.",
          why: `${fc.channel} contributes ${fmtPct0(fc.contribution)} of the ${model.daily ? "cancellations above normal" : "cancellation increase"}${fcSc ? `; the ${scope} ${fc.channel} cancel rate is ${fmtPct(fcSc.cancelRate)}` : ""}.`,
          evidence: [
            `${fc.channel} cancellations ${fc.cancelsMoM === null ? fmtInt(fc.cancels) : fmtSignedPct(fc.cancelsMoM)}; cancel rate ${fmtPct(fc.cancelRate)}`,
            ...(fcSc ? [`${scope} ${fc.channel}: ${fmtInt(fcSc.cancels)} cancellations, Post ODD ${fmtPct0(fcSc.postPct)}, Pending Customer Contact ${fmtPct0(fcSc.pendingPct)}`] : []),
          ],
          request: `Reinforce appointment expectation setting in the ${fc.channel} sales script, verify contact and access details at order entry, and review representative level cancellation rates weekly.`,
          measures: [`${fc.channel} cancel rate`, `${fc.channel} Pending Customer Contact share`],
          href: analysisHref({ channel: fc.channel }, month), hrefLabel: `Open ${fc.channel} analysis`,
        } as ActionItem]
      : []),
    {
      id: "field", title: "Technician Arrival Confirmation", ...own("Field Operations"), priority: P("High", "Low"), market,
      population: (r("noAccess") ?? 0) + (r("tech") ?? 0), populationLabel: `No Access and Tech on Job cancellations (${monthName(month)})`,
      impact: "Reduce failed visits and cancellations after dispatch by confirming access and intent on the day of the appointment.",
      why: "No Access / Not Home and Cancelled while Tech on Job both represent cancellations after field effort has been committed.",
      evidence: [`No Access / Not Home ${fmtInt(r("noAccess"))}`, `Cancelled while Tech on Job ${fmtInt(r("tech"))}`, `On Time Install ${fmtPct0(s.onTimePct)}`],
      request: "Introduce a technician en route notification with a confirm or reschedule option, and require confirmation of access before dispatch for orders flagged Pending Customer Contact.",
      measures: ["No Access / Not Home cancellations", "Cancelled while Tech on Job", "On Time Install %"],
      href: `/cancellations?tab=miss&${q}`, hrefLabel: "Review Customer Miss",
    },
    {
      id: "monitor", title: "Closed Loop Outcome Tracking", ...own("Insights and BI"), priority: "Medium", market: "All markets",
      population: null, populationLabel: "Tracking, not a population",
      impact: "Demonstrate whether the actions are working by tracking the leading and lagging measures weekly.",
      why: "Provides the evidence base for continuing, scaling or adjusting each action.",
      evidence: [`Baseline for ${monthLabel(month)}: cancel rate ${fmtPct(port.cancelRate)}, Post ODD ${fmtPct0(port.postPct)}, Pending Customer Contact ${fmtPct0(port.pendingPct)}`],
      request: "Publish a weekly scorecard covering Post ODD share, Pending Customer Contact, the late stage Customer Miss reasons and cancel rate, split by state and channel.",
      measures: ["Weekly scorecard published", "Trend against the baseline month"],
      href: `/cancellations?tab=timing&${q}`, hrefLabel: "Open timing analysis",
    },
    {
      id: "netwatch", title: "Maintain Network Readiness Watch", ...own("Network Operations"), priority: "Low", market: "All markets",
      population: null, populationLabel: "Monitoring only",
      impact: "Maintain current BSW and jeopardy monitoring; no diversion of capacity is required.",
      why: `BSW Delay Predicted ${fmtPct0(port.bswPct)} and Install in Jeopardy ${fmtPct0(port.jeopardyPct)} are not driving the change.`,
      evidence: [`BSW Delay Predicted ${fmtPct0(port.bswPct)}`, `Install in Jeopardy ${fmtPct0(port.jeopardyPct)}`, `Company Miss ${fmtPct0(port.coPct)}`],
      request: "Continue the standard readiness review and escalate only if BSW Delay Predicted or Install in Jeopardy rises by more than two points.",
      measures: ["BSW Delay Predicted %", "Install in Jeopardy %"],
      href: `/watchtower?${q}`, hrefLabel: "Open Watchtower",
    },
  ];
  return withPreventionPlan(model, month, list, d);
}

/**
 * When the workbook carries the agency and prevention sheets for this period's focus state, the
 * action list follows the prevention plan: sales quality verification replaces the generic channel
 * action, installation readiness replaces the broad network watch, and the confirmation outreach
 * becomes the customer-contact rescue. Saves come straight from the plan.
 */
function withPreventionPlan(model: DataModel, month: MonthKey, list: ActionItem[], d: Diagnosis): ActionItem[] {
  const st = model.story;
  const hot = d.hotspot;
  if (!d.anomaly || !hot || st.focusState !== hot.state || st.month !== month || !st.interventions.length) return list;
  const iv = (k: string) => st.interventions.find((x) => x.kind === k);
  const q = `month=${month}`;
  const own = (o: string) => ({ owner: o, ownerEmail: OWNER_EMAILS[o] ?? "" });
  const out = [...list];

  const contact = iv("contact");
  const confirm = out.find((a) => a.id === "confirm");
  if (contact && confirm) {
    const pop = st.contactRisk[0];
    const driver = st.drivers.find((x) => x.kind === "contact");
    Object.assign(confirm, {
      title: "Customer Contact Rescue",
      saves: contact.saves,
      population: pop?.value ?? confirm.population,
      populationLabel: pop?.label ?? confirm.populationLabel,
      impact: `${contact.action}. Potential saves: about ${fmtInt(contact.saves)} orders.`,
      evidence: [
        ...(driver ? [`Customer contact and appointment readiness is the primary cause of ${fmtInt(driver.cancels)} ${hot.state} cancellations (${fmtPct0(driver.share)})`] : []),
        ...(st.contactRisk[1] ? [`${st.contactRisk[1].label}: ${fmtInt(st.contactRisk[1].value)}`] : []),
        ...confirm.evidence,
      ],
      request: st.contactRules.length
        ? `Apply cause-specific rules to every at-risk order: ${st.contactRules.map((r) => `${r.label.toLowerCase()}: ${r.value.toLowerCase()}`).join("; ")}.`
        : confirm.request,
    });
  }

  const sales = iv("sales");
  // Day-wise: the partners named are those that broke from their own history over the last 30 days (one story for every period).
  const weak = st.agencies.filter((a) => ((model.daily ? model.daily.stable.agencyGap[a.agency] : a.gap) ?? 0) >= AGENCY_GAP_THRESHOLD).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0));
  if (sales && weak.length) {
    const channels = [...new Set(weak.map((a) => a.channel))];
    const driver = st.drivers.find((x) => x.kind === "sales");
    const critical = st.cohorts.filter((c) => /critical/i.test(c.band) && weak.some((a) => a.agency === c.agency));
    const item: ActionItem = {
      id: "sales-quality", title: "Sales Quality Verification", ...own("Sales Quality Assurance"), priority: "Critical",
      market: `${hot.state}, ${channels.join(" and ")}`,
      ...(model.daily
        ? { population: st.forecastChannels.filter((r) => !r.isTotal && channels.includes(r.channel)).reduce((a, r) => a + (r.sales ?? 0), 0), populationLabel: `${channels.join(" and ")} orders expected in the next 30 days, to score and verify` }
        : { population: weak.reduce((a, x) => a + (x.sales ?? 0), 0), populationLabel: `${monthShort(month)} sales through agencies running above their own history` }),
      impact: `${sales.action}. Potential saves: about ${fmtInt(sales.saves)} orders.`,
      why: `${[...weak.map((a) => a.agency)].sort().reduce((s, a, i, all) => s + (i === 0 ? "" : i === all.length - 1 ? " and " : ", ") + a, "")} run ${fmtPp(Math.min(...weak.map((a) => a.gap ?? 0)))} to ${fmtPp(Math.max(...weak.map((a) => a.gap ?? 0)))} above their own history${driver ? `; sales and agency quality is the primary cause of ${fmtInt(driver.cancels)} cancellations (${fmtPct0(driver.share)})` : ""}.`,
      evidence: [
        ...weak.map((a) => `${a.agency} (${a.channel}): ${fmtPct(a.baseline)} history to ${fmtPct(a.cancelRate)} in ${monthShort(month)}${a.pattern ? `; ${a.pattern.toLowerCase()}` : ""}`),
        ...critical.slice(0, 2).map((c) => `${c.agency} ${c.cohort.toLowerCase()}: ${fmtPct0(c.salesShare)} of sales, ${fmtPct0(c.cancelShare)} of cancellations`),
      ],
      request: "Independently verify orders that score high on rep risk, promotion sensitivity, low intent, price or offer mismatch (failed confirmation) or competitor mention before installation is scheduled, and coach or pause Critical representatives.",
      measures: ["Critical representative share", ...channels.map((c) => `${hot.state} ${c} cancel rate`), "Share of risky orders verified before installation"],
      href: analysisHref({ agency: weak[0].agency }, month), hrefLabel: `Open ${weak[0].agency} analysis`, saves: sales.saves,
    };
    const i = out.findIndex((a) => a.id === "channel");
    if (i >= 0) out.splice(i, 1, item);
    else out.splice(1, 0, item);
  }

  const install = iv("install");
  const segs = st.segments.filter((s) => !s.isTotal);
  if (install && segs.length) {
    const total = st.segments.find((s) => s.isTotal)?.orders ?? segs.reduce((a, s) => a + (s.orders ?? 0), 0);
    const item: ActionItem = {
      id: "install", title: "High-Value Customer Protection", ...own("Installation Planning"), priority: "High", market: hot.state,
      population: total, populationLabel: `${hot.state} delivery-risk orders`,
      impact: `${install.action}. Potential saves: about ${fmtInt(install.saves)} orders.`,
      why: "Ready high-value customers should not be lost to a late date, and impossible dates should be corrected before they fail; each segment needs a different response.",
      evidence: segs.map((s) => `${s.segment}: ${fmtInt(s.orders)} orders (${s.signal.toLowerCase()})`),
      request: segs.map((s) => `${s.segment}: ${s.action.toLowerCase()}`).join("; ") + ".",
      measures: ["ODD miss rate on delivery-risk orders", "Post ODD cancellation share", "Ready jobs accelerated"],
      href: `/watchtower?${q}&state=${stateSlug(hot.state)}`, hrefLabel: "Open Watchtower", saves: install.saves,
    };
    const i = out.findIndex((a) => a.id === "netwatch");
    if (i >= 0) out.splice(i, 1);
    out.splice(Math.min(2, out.length), 0, item);
  }
  // The three prevention layers lead, in plan order; supporting actions follow.
  const lead = ["confirm", "sales-quality", "install"];
  const rank = (id: string) => (lead.includes(id) ? lead.indexOf(id) : lead.length);
  return out.map((a, i) => ({ a, i })).sort((x, y) => rank(x.a.id) - rank(y.a.id) || x.i - y.i).map((x) => x.a);
}

/** Email the task owner receives when an action is initiated. */
export function actionEmail(a: ActionItem, month: MonthKey) {
  const subject = `Action requested: ${a.title} (${a.market}, ${monthLabel(month)})`;
  const body = [
    `Dear ${a.owner} team,`,
    "",
    `The Cancellation Intelligence review for ${monthLabel(month)} has identified an action for your team. We would appreciate your support in taking this forward.`,
    "",
    `Action: ${a.title}`,
    `Priority: ${a.priority}`,
    `Market: ${a.market}`,
    ...(a.population !== null ? [`Affected population: ${a.population.toLocaleString("en-US")} (${a.populationLabel})`] : []),
    "",
    "Why this matters:",
    a.why,
    "",
    "Supporting evidence:",
    ...a.evidence.map((e) => `  • ${e}`),
    "",
    "Requested action:",
    a.request,
    "",
    "Success measures:",
    ...a.measures.map((m) => `  • ${m}`),
    "",
    "Could you please confirm ownership and a target start date within the next five business days? We will track progress in the weekly cancellation scorecard.",
    "",
    "Kind regards,",
    "Cancellation Intelligence Team",
  ].join("\n");
  return { subject, body };
}

// ------------------------------------------------------------------ scope story (state or channel plan)
export interface StoryPoint {
  text: string;
  tone: "bad" | "neutral" | "good";
}

export interface StateStory {
  change: StoryPoint;
  timing: StoryPoint;
  who: StoryPoint;
  why: StoryPoint;
  seen: StoryPoint;
  verdict: "customer-readiness" | "operational" | "mixed" | "insufficient";
}

/** Plain-language read-outs for each section of a state or channel plan, generated from the data. */
export function stateStory(model: DataModel, month: MonthKey, scope: string): StateStory {
  const name = scopeName(scope);
  const pm = prevMonth(model, month);
  const cur = getSnapshot(model, month, scope);
  const prev = pm ? getSnapshot(model, pm, scope) : null;
  const port = getSnapshot(model, month, null);
  const P = pm ? monthName(pm) : "the previous period";
  const rel = (a: number | null, b: number | null | undefined) => (a !== null && b ? a / b - 1 : null);

  const cMoM = rel(cur.cancels, prev?.cancels), sMoM = rel(cur.sales, prev?.sales);
  let change: StoryPoint = { text: `${name} has no previous period comparison available.`, tone: "neutral" };
  if (cMoM !== null && sMoM !== null) {
    const bad = cMoM > sMoM + 0.05;
    change = {
      text: bad
        ? `${name} cancellations rose ${abs(fmtSignedPct(cMoM))} versus ${P} while sales moved ${fmtSignedPct(sMoM)}; cancellations are growing materially faster than demand. The cancel rate moved from ${fmtPct(prev?.cancelRate ?? null)} to ${fmtPct(cur.cancelRate)}.`
        : `${name} cancellations moved ${fmtSignedPct(cMoM)} against sales of ${fmtSignedPct(sMoM)}, broadly in line with volume. The cancel rate is ${fmtPct(cur.cancelRate)}.`,
      tone: bad ? "bad" : "good",
    };
  }

  const shift = cur.postPct !== null && prev?.postPct != null ? cur.postPct - prev.postPct : null;
  const timing: StoryPoint =
    cur.postPct === null
      ? { text: "The timing split is not available for this selection.", tone: "neutral" }
      : {
          text: `${fmtPct0(cur.postPct)} of ${name} cancellations occur after the Original Due Date${shift !== null ? ` (${fmtPct0(prev!.postPct)} in ${P}, ${fmtPp(shift)})` : ""}, compared with ${fmtPct0(port.postPct)} across the portfolio${cur.postPct > (port.postPct ?? 1) + 0.03 ? "; a stronger late stage concentration than elsewhere" : ""}.`,
          tone: (shift ?? 0) > 0.05 ? "bad" : "neutral",
        };

  const who: StoryPoint =
    cur.custPct === null
      ? { text: "Classification is not available for this selection.", tone: "neutral" }
      : {
          text: `Customer Miss represents ${fmtPct0(cur.custPct)} of cancellations (${fmtInt(cur.custMiss)} orders), Company Miss ${fmtPct0(cur.coPct)} and Faux ${fmtPct0(cur.fauxPct)}.${cur.custPct > (port.custPct ?? 1) ? ` This is above the portfolio level of ${fmtPct0(port.custPct)}.` : ""}`,
          tone: cur.custPct >= 0.7 ? "bad" : "neutral",
        };

  const rs = isChannel(scope) ? [] : reasonStats(model, month, scope);
  const hot = rs.filter((r) => r.lateStage && (r.mom ?? 0) > 0.25);
  const why: StoryPoint = hot.length
    ? { text: `${hot.map((r) => `${r.label} (${fmtSignedPct(r.mom)})`).join(", ")} ${hot.length > 1 ? "are" : "is"} growing fastest: customers who are unavailable, repeatedly reschedule, or cancel with the technician on site.`, tone: "bad" }
    : { text: rs[0] ? `${rs[0].label} is the largest reason (${fmtPct0(rs[0].share)}); no late stage reason is rising sharply.` : "Reason detail is recorded by state rather than by channel.", tone: "neutral" };

  const p = cur.pendingPct, b = cur.bswPct, j = cur.jeopardyPct;
  let seen: StoryPoint = { text: `Watchtower signals for ${name} are not available for this period.`, tone: "neutral" };
  let verdict: StateStory["verdict"] = "insufficient";
  if (p !== null) {
    const tech = (b ?? 0) + (j ?? 0);
    verdict = p > tech ? "customer-readiness" : "operational";
    seen = {
      text:
        p > tech
          ? `Customer contact signals are materially stronger than technical risk: Pending Customer Contact ${fmtPct0(p)}${prev?.pendingPct != null ? ` (${fmtPct0(prev.pendingPct)} in ${P})` : ""} against Install in Jeopardy ${fmtPct0(j)} and BSW Delay Predicted ${fmtPct0(b)}. The issue is customer engagement and appointment readiness.`
          : `Technical risk signals (Install in Jeopardy ${fmtPct0(j)}, BSW ${fmtPct0(b)}) are at least as strong as customer contact signals (${fmtPct0(p)}); an operational cause cannot be ruled out.`,
      tone: p > tech ? "bad" : "neutral",
    };
  }
  return { change, timing, who, why, seen, verdict };
}

