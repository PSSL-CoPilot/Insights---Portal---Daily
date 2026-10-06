/**
 * Narrative builders: the Command Center executive story, the "What is happening?" read-outs for
 * the plan overview and for each state or channel plan, and the recommended intervention layers.
 * Sentences are templates; every figure comes from `storyFacts` or the metrics layer.
 */
import type { AgencySnapshotRow, DataModel, InterventionRow, MonthKey } from "../data/types";
import { hz, parseKey, presets } from "../data/daily";
import { getSnapshot, isChannel, prevMonth, scopeName, stateRows, type Snapshot } from "../data/metrics";
import { fmtInt, fmtPct, fmtPct0, fmtPp, fmtSignedPct, monthName, monthShort } from "../format";
import { riskFactors, storyFacts, type StoryFacts } from "./facts";
import { agencyLink, channelLink, hrefs, link, listJoin, scopeLink, stateLink } from "./links";
import type { NarrativePoint, Recommendation, StorySection } from "./types";

const abs = (s: string) => s.replace(/^[+−]/, "");
/** "between 16% and 18%", or "near 15%" when both ends round to the same value. */
const between = (r: [number, number] | null) => (!r ? "" : fmtPct0(r[0]) === fmtPct0(r[1]) ? `near ${fmtPct0(r[0])}` : `between ${fmtPct0(r[0])} and ${fmtPct0(r[1])}`);
const growthRange = (r: [number, number] | null) => (!r ? "" : `${fmtSignedPct(r[0])} and ${fmtSignedPct(r[1])}`);
const rel = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? a / b - 1 : null);

/** Display names for the prevention layers (the workbook keeps its internal programme names). */
export const INTERVENTION_LABEL: Record<InterventionRow["kind"], string> = {
  sales: "Sales quality verification",
  install: "High-value customer protection",
  contact: "Customer-contact rescue",
  total: "Deduplicated total",
  other: "Recommended intervention",
};
/** Imperative form for the "what to do now" line. */
const INTERVENTION_VERB: Record<InterventionRow["kind"], string> = {
  sales: "verify risky sales", install: "protect high-value customers", contact: "rescue customer contact", total: "act", other: "act",
};
const INTERVENTION_ACTION: Partial<Record<InterventionRow["kind"], string>> = { sales: "sales-quality", install: "install", contact: "confirm" };

/** Coaching focus for a partner, from its main sales quality pattern in the workbook. */
export function agencyCoaching(a: Pick<AgencySnapshotRow, "pattern">): { focus: string; action: string } {
  if (/rep mix|new rep|replacement/i.test(a.pattern)) return { focus: "sales quality for its newer and replacement reps", action: "Coach the newer and replacement reps and tighten sales quality checks on their orders" };
  if (/confirm|follow/i.test(a.pattern)) return { focus: "confirmation and follow-up discipline", action: "Improve confirmation and follow-up discipline after every sale" };
  if (/competitor|promotion|promo/i.test(a.pattern)) return { focus: "competitor handling and promotion expectations", action: "Coach competitor handling, reliability messaging and clear promotion expectations" };
  return { focus: "sales quality", action: "Review sales quality with the partner" };
}

/** Day-wise headline: "Over the last 5 days, cancellations increased {{bad:24%}} while Unique Sales increased {{good:6%}}". */
function dailyHeadline(f: StoryFacts): string {
  const m = f.model, key = f.month, ids = presets(m).filter((p) => p.key === key).map((p) => p.id);
  const [start, end] = parseKey(key);
  const move = (v: number | null, upIsGood: boolean) => {
    if (v === null) return "had no comparison";
    if (Math.abs(v) < 0.005) return "held flat";
    const tone = v > 0 === upIsGood ? "good" : "bad";
    return `${v > 0 ? "increased" : "decreased"} {{${tone}:${fmtPct0(Math.abs(v))}}}`;
  };
  const n = ids.find((x) => x === "5" || x === "7" || x === "30");
  const lead = ids.includes("latest") ? "Today: Cancellations"
    : n ? `Over the last ${n} days${ids.includes("mtd") ? " (month to date)" : ""}, cancellations`
    : ids.includes("mtd") ? "Month to date, cancellations"
    : end === m.daily!.dates[m.daily!.dates.length - 1] && start !== end ? `Over the last ${m.daily!.days} days, cancellations`
    : start === end ? `On ${monthShort(start)}, cancellations`
    : `From ${monthShort(start)} to ${monthShort(end)}, cancellations`;
  return `${lead} ${move(f.d.cancelsMoM, false)} while Unique Sales ${move(f.d.salesMoM, true)}`;
}

// ------------------------------------------------------------------ shared point builders
function portfolioPoint(f: StoryFacts): NarrativePoint {
  const M = monthName(f.month);
  const { d, port, portPrev } = f;
  if (!f.prev || d.cancelsMoM === null) {
    return { id: "portfolio", mode: "observed", label: "Portfolio", tone: "neutral", text: f.model.daily ? `**${fmtInt(port.cancels)}** cancellations in ${M} at a **${fmtPct(port.cancelRate)}** cancel rate, against a ${fmtPct(f.baselineRate)} norm. No earlier period of the same length is available to compare with.` : `${M} is the first month in the dataset, so a month over month comparison is not available.` };
  }
  if (!d.anomaly) {
    return {
      id: "portfolio", mode: "observed", label: "Portfolio", tone: "good",
      text: `**${M} performance is in line with trend.** Cancellations moved ${fmtSignedPct(d.cancelsMoM)} against ${fmtSignedPct(d.salesMoM)} sales versus ${monthName(f.prev)}, with a cancel rate of **${fmtPct(port.cancelRate)}** (${fmtPct(portPrev?.cancelRate)} before), close to the ${fmtPct(f.baselineRate)} norm.`,
      evidence: { kind: "trend", scope: null, title: "Cancel rate by day", interpretation: `The cancel rate stayed inside its usual range in ${M}; no exception is present.` },
    };
  }
  const salesWord = (d.salesMoM ?? 0) >= 0 ? `Unique Sales grew only **${abs(fmtSignedPct(d.salesMoM))}**` : `Unique Sales fell **${abs(fmtSignedPct(d.salesMoM))}**`;
  return {
    id: "portfolio", mode: "observed", label: "Portfolio", tone: "bad",
    text:
      `**${M} cancellations rose ${abs(fmtSignedPct(d.cancelsMoM))}** to ${fmtInt(port.cancels)} while ${salesWord}. ` +
      `The cancel rate moved from ${fmtPct(portPrev?.cancelRate)} to **${fmtPct(port.cancelRate)}**` +
      (f.baselineRate !== null ? `, against an internal baseline of ${fmtPct(f.baselineRate)}` : "") +
      (f.multiple !== null ? `: about **${Math.round(f.multiple)}×** the normal movement.` : "."),
    evidence: {
      kind: "trend", scope: null, title: "Cancel rate by day",
      interpretation: `The rate held near ${fmtPct(f.baselineRate)} through ${f.prev ? monthName(f.prev) : "the previous period"}, then broke out in ${M}; sales growth of ${fmtSignedPct(d.salesMoM)} does not explain the move.`,
    },
  };
}

function geographyPoint(f: StoryFacts): NarrativePoint | null {
  const h = f.focus;
  if (!h) return null;
  const n = f.model.states.length - 1;
  return {
    id: "geography", mode: "observed", label: "Geography", tone: "bad",
    text:
      `${stateLink(h.state, f.month)} explains **${fmtPct0(h.contribution)}** of the cancellations above normal${h.cancelsMoM !== null ? `: cancellations **${fmtSignedPct(h.cancelsMoM)}**` : ""} at a **${fmtPct(h.cancelRate)}** cancel rate.` +
      (f.otherGrowth ? ` The other ${n} states moved between ${growthRange(f.otherGrowth)}.` : ""),
    evidence: {
      kind: "ranking", dim: "state", metric: "cancels", highlight: [h.state], title: `Cancellations by state, ${monthName(f.month)}`,
      interpretation: `${h.state} is the only state outside its normal range; every other state's cancel rate sits ${between(f.otherRate)}.`,
    },
  };
}

function channelPoint(f: StoryFacts): NarrativePoint | null {
  const M = monthName(f.month);
  if (f.focus && f.outlierChannels.length) {
    const links = f.outlierChannels.map((c) => channelLink(c.channel, f.month));
    const rates = f.outlierChannels.map((c) => `**${fmtPct(c.rate)}**`);
    return {
      id: "channel", mode: "observed", label: "Channel", tone: "bad",
      text:
        `Inside ${f.focus.state}, ${listJoin(links)} carry the deterioration at ${listJoin(rates)} cancel rates` +
        (f.normalChannelRate ? `, while its other channels stay ${between(f.normalChannelRate)}.` : "."),
      evidence: {
        kind: "scope-channels", state: f.focus.state, highlight: f.outlierChannels.map((c) => c.channel), title: `${f.focus.state} cancel rate by channel, ${M}`,
        interpretation: `${listJoin(f.outlierChannels.map((c) => c.channel))} run at more than twice the rate of every other ${f.focus.state} channel.`,
      },
    };
  }
  const top = f.portfolioChannels.filter((c) => (c.contribution ?? 0) > 0.25);
  if (!f.d.anomaly || !top.length) return null;
  return {
    id: "channel", mode: "observed", label: "Channel", tone: "bad",
    text: `By channel, ${listJoin(top.map((c) => channelLink(c.channel, f.month)))} account for ${listJoin(top.map((c) => `**${fmtPct0(c.contribution)}**`))} of the cancellations above normal.`,
    evidence: {
      kind: "ranking", dim: "channel", metric: "cancels", highlight: top.map((c) => c.channel), title: `Cancellations by channel, ${M}`,
      interpretation: `${listJoin(top.map((c) => c.channel))} contribute most of the cancellation growth; the remaining channels moved little.`,
    },
  };
}

function timingPoint(f: StoryFacts): NarrativePoint | null {
  const { port, portPrev } = f;
  if (port.postPct === null || !f.prev) return null;
  const shift = portPrev?.postPct != null ? port.postPct - portPrev.postPct : null;
  if (!f.d.anomaly && (shift ?? 0) < 0.03) {
    return {
      id: "timing", mode: "observed", label: "Lifecycle timing", tone: "neutral",
      text: `${link("Post ODD", hrefs.postOdd(f.month))} cancellations are ${fmtPct0(port.postPct)} of the total, broadly unchanged from ${fmtPct0(portPrev?.postPct)}.`,
      evidence: { kind: "timing", scope: null, title: "Cancellation timing by day", interpretation: "The lifecycle mix is stable; no late stage shift is present." },
    };
  }
  const late = f.lateDrivers.slice(0, 3).map((r) => `${r.label} (${fmtSignedPct(r.mom)})`);
  const fp = f.focusSnap?.postPct ?? null;
  return {
    id: "timing", mode: "observed", label: "Lifecycle timing", tone: "bad",
    text:
      `Most of the loss comes late: ${link("Post ODD", hrefs.postOdd(f.month))} cancellations reached **${fmtPct0(port.postPct)}** of the total (from ${fmtPct0(portPrev?.postPct)})` +
      (f.focus && fp !== null ? ` and **${fmtPct0(fp)}** in ${f.focus.state}` : "") +
      (late.length ? `, led by ${listJoin(late)}.` : "."),
    evidence: {
      kind: "timing", scope: f.focus?.state ?? null, title: `${f.focus ? `${f.focus.state} c` : "C"}ancellation timing by day`,
      interpretation: "Customers are increasingly lost after the committed installation date: an appointment journey failure rather than an early change of mind.",
    },
  };
}

function rootCausePoint(f: StoryFacts): NarrativePoint | null {
  if (f.hasStory || !f.d.anomaly) return null;
  const t =
    f.d.rootCause === "customer-readiness"
      ? `Customer contact signals rose while installation risk stayed low, pointing to a **customer engagement and appointment readiness** issue.`
      : f.d.rootCause === "operational"
        ? `Company side and installation readiness signals are rising, indicating an **operational readiness** issue.`
        : `Customer side and operational signals both moved; the cause is **mixed**.`;
  return {
    id: "root-cause", mode: "observed", label: "Journey root-cause analysis", tone: "bad", text: t,
    evidence: { kind: "watch", scope: f.focus?.state ?? null, title: "Watchtower signals on cancelled orders", interpretation: "The relative size of customer and installation signals separates the two kinds of cause." },
  };
}

// ------------------------------------------------------------------ Command Center
/** `{{bad:+36%}}` when a move hurts the business, `{{good:+5%}}` when it helps. */
const toned = (v: number | null, goodWhenUp: boolean) => {
  if (v === null) return "n/a";
  const tone = Math.abs(v) < 0.005 ? "neutral" : (v > 0) === goodWhenUp ? "good" : "bad";
  return `{{${tone}:${fmtSignedPct(v)}}}`;
};

/**
 * Executive story in one continuous sequence: portfolio, the focus state, its channels, the sales
 * quality problem and (immediately) its October prevention, the customer contact problem, late
 * stage timing, the October outlook and the action. Short sentences; every figure from the data.
 */
function executivePoints(f: StoryFacts): NarrativePoint[] | null {
  const { d, port, portPrev, month, focus } = f;
  if (!f.hasStory || !focus || !d.anomaly) return null;
  const M = monthName(month);
  const out: NarrativePoint[] = [];
  const s = f.drivers.sales, c = f.drivers.contact;

  const daily = f.model.daily;
  out.push({
    id: "portfolio", mode: "observed", label: "Portfolio", tone: "bad",
    text: daily
      ? (daily.days === 1 ? `On ${M} cancellations reached **${fmtInt(port.cancels)}**` : `From ${M} (${daily.days} days) cancellations reached **${fmtInt(port.cancels)}**, about **${fmtInt(Math.round((port.cancels ?? 0) / daily.days!))}** a day`) +
        `. The cancel rate is **${fmtPct(port.cancelRate)}**, against ${f.prev && portPrev?.cancelRate != null ? `${fmtPct(portPrev.cancelRate)} in the previous period (${monthName(f.prev)}) and ` : ""}a ${fmtPct(f.baselineRate)} norm.`
      : `Cancellations reached **${fmtInt(port.cancels)}**. The cancel rate rose from ${fmtPct(portPrev?.cancelRate)} to **${fmtPct(port.cancelRate)}**, well above the ${fmtPct(f.baselineRate)} norm.`,
    evidence: daily
      ? { kind: "trend", scope: null, title: "Daily cancel rate", interpretation: `The rate left its normal range on ${(() => { const x = daily.detection.find((r) => /^Portfolio/.test(r.signal)); return x?.date ? monthShort(x.date) : "the first flagged day"; })()} and has held near its new level since. Sales growth does not explain it.` }
      : { kind: "trend", scope: null, title: "Cancel rate by day", interpretation: `Stable all year, then a clear break in ${M}. Sales growth does not explain it.` },
  });

  // Day-wise only: when each signal first crossed its threshold (Detection Timeline sheet).
  const det = daily?.detection.filter((x) => x.date && x.date <= (daily.end ?? x.date)) ?? [];
  if (det.length) {
    const day = (iso: string) => monthShort(iso);
    const first = det[0], at = (re: RegExp) => det.find((x) => re.test(x.signal));
    const st = at(new RegExp(`^${focus.state} cancel rate`)), pf = at(/^Portfolio cancel rate/), post = at(/Post ODD/), pend = at(/Pending Customer Contact/);
    out.push({
      id: "detection", mode: "observed", label: "When it started", tone: "bad",
      text:
        `The first warning came on **${day(first.date!)}**${first.daysBefore != null ? ` (${first.daysBefore} days ago)` : ""}: ${first.signal} at ${fmtPct0(first.value)}.` +
        (st && st !== first ? ` ${focus.state} left its normal range on **${day(st.date!)}**.` : "") +
        (pf ? ` The portfolio followed on **${day(pf.date!)}**.` : "") +
        (pend ? ` Pending Customer Contact passed ${fmtPct0(pend.value)} on **${day(pend.date!)}**` : "") +
        (post ? `${pend ? ";" : ""} late (Post ODD) losses followed on **${day(post.date!)}**.` : pend ? "." : ""),
      evidence: { kind: "trend", scope: focus.state, title: `${focus.state} daily cancel rate`, interpretation: "Daily tracking shows the problem weeks before a monthly report would." },
    });
  }

  out.push({
    id: "geography", mode: "observed", label: "Where", tone: "bad",
    text: daily
      ? `${stateLink(focus.state, month)} accounts for **${fmtPct0(focus.contribution)}** of the cancellations above normal: its cancel rate is **${fmtPct(focus.cancelRate)}** against its usual ${fmtPct(focus.normal ?? null)}${focus.cancelsMoM !== null ? ` (cancellations ${fmtSignedPct(focus.cancelsMoM)} vs the previous period)` : ""}. The other states stay near normal${f.otherRate ? ` (${between(f.otherRate)})` : ""}.`
      : `${stateLink(focus.state, month)} drove **${fmtPct0(focus.contribution)}** of the cancellations above normal: its cancellations rose **${fmtSignedPct(focus.cancelsMoM)}**.`,
    evidence: { kind: "ranking", dim: "state", metric: "cancels", highlight: [focus.state], title: `Cancellations by state, ${M}`, interpretation: `${focus.state} is the only state outside its normal range.` },
  });

  if (f.outlierChannels.length) {
    const ch = f.outlierChannels;
    out.push({
      id: "channel", mode: "observed", label: "Which channels", tone: "bad",
      text: `Inside ${focus.state}, the problem sits in ${listJoin(ch.map((c) => channelLink(c.channel, month)))}: ${listJoin(ch.map((c) => `**${fmtPct(c.rate)}**`))} of sales cancelled${f.normalChannelRate ? `, against ${fmtPct0(f.normalChannelRate[0])} to ${fmtPct0(f.normalChannelRate[1])} in other channels` : ""}.`,
      evidence: { kind: "scope-channels", state: focus.state, highlight: ch.map((c) => c.channel), title: `${focus.state} cancel rate by channel`, interpretation: `${listJoin(ch.map((c) => c.channel))} cancel at more than twice the rate of every other channel.` },
    });
  }

  if (s && f.weakAgencies.length) {
    const gaps = f.weakAgencies.map((a) => a.gap ?? 0);
    const co = f.cohort;
    const named = [...f.weakAgencies].sort((x, y) => x.agency.localeCompare(y.agency));
    const byAgency = named.map((a) => `${a.agency.replace(/^Agency /, "")} on ${agencyCoaching(a).focus}`);
    out.push({
      id: "sales-quality", mode: "observed", label: "Problem 1: sales quality", tone: "bad",
      text:
        `A change in the sales team mix is producing poorer-quality sales.` +
        (co ? ` At ${agencyLink(co.agency, month)}, newer and replacement reps made ${fmtPct0(co.salesShare)} of sales but **${fmtPct0(co.cancelShare)}** of cancellations.` : "") +
        ` ${listJoin(named.map((a) => co && a.agency === co.agency ? a.agency : agencyLink(a.agency, month)))} cancel ${fmtPp(Math.min(...gaps))} to ${fmtPp(Math.max(...gaps))} above their own history; poor-quality sales explain **${fmtInt(s.cancels)}** cancellations (**${fmtPct0(s.share)}**).` +
        ` These reps need targeted coaching: ${listJoin(byAgency)}.`,
      evidence: { kind: "sales-quality", title: `${focus.state}: rep mix, risk factors and coaching by agency`, interpretation: "Three partners, and inside them the newer reps, carry most of the loss: a sales team quality problem that coaching can fix, not a market one." },
    });

    // Forward-looking, straight after the problem it prevents.
    const iv = f.interventions.sales;
    const ro = f.riskyOrders;
    if (iv && ro.orders !== null) {
      const sg = f.signals;
      out.push({
        id: "sales-prevention", mode: "preventive", label: `Prevention (next ${hz(f.model)} days): sales quality`, tone: "warn",
        text:
          `Score each of the **${fmtInt(ro.orders)}** ${listJoin(ro.channels)} orders expected in ${focus.state} over the next ${hz(f.model)} days on five risk factors: ` +
          `${listJoin(riskFactors(f).map((x) => x.short))}. ` +
          `Verify the riskiest orders before installation and coach the reps behind them: about **${fmtInt(iv.saves)}** cancellations avoided.`,
        evidence: { kind: "sales-prevention", title: "Preventive sales quality analysis", interpretation: `Without action these orders are projected to cancel at ${fmtPct0(ro.rate)}. Verifying them before installation turns a lost sale into a confirmed or corrected one.` },
      });
    }
  }

  if (c) {
    const bigger = !s || (c.cancels ?? 0) >= (s.cancels ?? 0);
    out.push({
      id: "contact", mode: "observed", label: `Problem 2${bigger ? ", the bigger one" : ""}: customer contact`, tone: "bad",
      text:
        `**${fmtInt(c.cancels)}** cancellations (**${fmtPct0(c.share)}**) came from customers we could not confirm or reach for the appointment.` +
        (f.focusSnap?.pendingPct != null ? ` Separately, **${fmtPct0(f.focusSnap.pendingPct)}** carried a ${link("Pending Customer Contact", hrefs.watchtower(month, focus.state))} signal: a different measure from the cause.` : ""),
      evidence: { kind: "drivers", title: `${focus.state}: one primary cause per order`, interpretation: "The two problems need different owners: partner quality, and the customer appointment journey." + (f.reclassMoved ? ` Journey root-cause analysis also moves ${fmtInt(f.reclassMoved)} cancellations from Customer Miss to Company Miss.` : "") },
    });
  }

  if (port.postPct !== null) {
    const late = f.lateDrivers.slice(0, 3).map((r) => r.label.replace(/^Cancelled while /, "").replace(/^Customer Requested /, "").toLowerCase());
    out.push({
      id: "timing", mode: "observed", label: "When", tone: "bad",
      text: `Most customers are lost late: **${fmtPct0(port.postPct)}** cancel after the ${link("due date", hrefs.postOdd(month))}${f.focusSnap?.postPct != null ? ` (**${fmtPct0(f.focusSnap.postPct)}** in ${focus.state})` : ""}${late.length ? `, led by ${listJoin(late)}` : ""}.`,
      evidence: { kind: "timing", scope: focus.state, title: `${focus.state} cancellation timing by day`, interpretation: "The loss happens after the committed date: an appointment journey failure, not an early change of mind." },
    });
  }

  // Forward-looking: protect high-value customers whose installation is at risk.
  const hv = f.highValue, ivi = f.interventions.install;
  if (ivi && hv.total !== null && hv.accelerate && hv.resetOdd) {
    out.push({
      id: "high-value", mode: "preventive", label: `Prevention (next ${hz(f.model)} days): high-value customers`, tone: "warn",
      text:
        `Combine each order's cancellation-risk score with Customer Lifetime Value (CLTV), the ODD and permit and construction readiness. ` +
        `Of **${fmtInt(hv.total)}** ${focus.state} delivery-risk orders, **${fmtInt(hv.accelerate.orders)}** high-value customers are ready but scheduled late: bring their installation forward. ` +
        `**${fmtInt(hv.resetOdd.orders)}** have an ODD that cannot be met: correct the commitment before it fails. About **${fmtInt(ivi.saves)}** cancellations avoided.`,
      evidence: { kind: "high-value", title: "High-value customer protection", interpretation: "Act where it pays: speed up ready high-value jobs, reset impossible dates early, and leave low-risk orders on their normal route." },
    });
  }

  const fc = f.forecast;
  if (fc.noAction !== null) {
    const FM = `Next ${hz(f.model)} days`;
    out.push({
      id: "outlook", mode: "preventive", label: `${FM} outlook`, tone: "warn",
      text: (() => { const o = daily?.outlook?.[hz(f.model)]; return o ? `Next ${o.days} days (${monthShort(o.from)} to ${monthShort(o.to)}): **${fmtPct(o.rateNo)}** without action${f.forecastFocus ? ` (${focus.state} **${fmtPct(f.forecastFocus.rate)}**)` : ""}; if the three actions start the next day it trends to **${fmtPct(o.rateWith)}**: about **${fmtInt(f.interventions.total?.saves ?? null)}** cancellations avoided.` : ""; })(),
      evidence: { kind: "forecast", title: "Cancel rate: actual, outlook and intervention", interpretation: `Acting now turns a further rise into the first recovery step, back toward ${fmtPct(fc.baseline)}.` },
    });
  }

  const ivs = (["sales", "install", "contact"] as const).map((k) => f.interventions[k]).filter((x): x is InterventionRow => !!x);
  if (ivs.length) {
    out.push({
      id: "action", mode: "preventive", label: "What to do now", tone: "warn",
      text: `${listJoin(ivs.map((x, i) => { const v = INTERVENTION_VERB[x.kind]; return `${i === 0 ? v.charAt(0).toUpperCase() + v.slice(1) : v} (**${fmtInt(x.saves)}**)`; }))}. ${link("Take action", hrefs.actions(month))}.`,
      evidence: { kind: "interventions", title: "Potential saves by action", interpretation: "Each order is counted once across the three actions." },
    });
  }
  return out;
}

export function buildExecutiveNarrative(model: DataModel, month: MonthKey): StorySection {
  const f = storyFacts(model, month);
  const M = monthName(month);
  const { d } = f;
  let headline: string;
  let subhead: string | undefined;
  if (!f.prev || d.cancelsMoM === null) {
    headline = model.daily ? `${M}: ${fmtInt(f.port.cancels)} cancellations at a ${fmtPct(f.port.cancelRate)} cancel rate` : `${M}: baseline month`;
    if (model.daily) subhead = `No earlier period of the same length is available to compare with (the daily data starts on ${monthShort(model.daily.dates[0])}).`;
  }
  else {
    headline = model.daily ? dailyHeadline(f) : `${M} cancellations ${toned(d.cancelsMoM, false)} vs Unique Sales ${toned(d.salesMoM, true)}`;
    if (!d.anomaly) subhead = "Performance is in line with trend.";
    else if (f.focus) {
      const most = (f.focus.contribution ?? 0) >= 0.9 ? "almost all" : "most";
      subhead = f.hasStory && f.drivers.sales && f.drivers.contact
        ? `${f.focus.state} drives ${most} of it, through two problems: sales quality and customer contact.`
        : `${f.focus.state} drives ${most} of it.`;
    } else subhead = "Cancellations are rising faster than sales.";
  }

  const points =
    executivePoints(f) ??
    [portfolioPoint(f), geographyPoint(f), channelPoint(f), rootCausePoint(f), timingPoint(f)].filter((p): p is NarrativePoint => !!p);

  return {
    id: "executive",
    eyebrow: "Executive Summary",
    headline,
    subhead,
    status: !f.prev ? null : d.anomaly ? { label: "Exception detected", tone: "bad" } : { label: "In line with trend", tone: "good" },
    points,
  };
}

// ------------------------------------------------------------------ recommendations
export function buildRecommendations(model: DataModel, month: MonthKey): { items: Recommendation[]; dedup: number | null } {
  const f = storyFacts(model, month);
  const items = (["sales", "install", "contact"] as const)
    .map((k) => f.interventions[k])
    .filter((x): x is InterventionRow => !!x)
    .map((r) => ({
      id: r.kind, label: INTERVENTION_LABEL[r.kind], saves: r.saves, share: r.share, action: r.action, population: r.population,
      actionId: INTERVENTION_ACTION[r.kind] ?? null,
    }));
  return { items, dedup: f.interventions.total?.saves ?? null };
}

// ------------------------------------------------------------------ "What is happening?" for a state or channel plan
function changePoint(model: DataModel, month: MonthKey, scope: string, cur: Snapshot, prev: Snapshot | null): NarrativePoint {
  const name = scopeName(scope);
  const pm = prevMonth(model, month);
  const cMoM = rel(cur.cancels, prev?.cancels), sMoM = rel(cur.sales, prev?.sales);
  if (cMoM === null || sMoM === null) {
    return { id: "change", mode: "observed", label: "What changed", tone: "neutral", text: `${name} has no previous period comparison available.` };
  }
  const bad = cMoM > 0.05 && cMoM > sMoM + 0.05;
  return {
    id: "change", mode: "observed", label: "What changed", tone: bad ? "bad" : "good",
    text: bad
      ? `Cancellations {{bad:${fmtSignedPct(cMoM)}}} vs sales ${toned(sMoM, true)} against ${pm ? monthName(pm) : "the previous period"}. The cancel rate went from ${fmtPct(prev?.cancelRate)} to **${fmtPct(cur.cancelRate)}**.`
      : `In line with trend: cancellations ${toned(cMoM, false)} vs sales ${toned(sMoM, true)}, a **${fmtPct(cur.cancelRate)}** cancel rate.`,
    evidence: { kind: "trend", scope, title: `${name} cancel rate by day`, interpretation: bad ? `${name} broke from its usual range in ${monthName(month)}.` : `${name} stayed within its usual range.` },
  };
}

function scopeTimingPoint(month: MonthKey, scope: string, cur: Snapshot, prev: Snapshot | null, port: Snapshot): NarrativePoint | null {
  if (cur.postPct === null) return null;
  const name = scopeName(scope);
  const state = isChannel(scope) ? null : scope;
  const late = cur.postPct > (port.postPct ?? 1) + 0.03 || cur.postPct - (prev?.postPct ?? cur.postPct) > 0.05;
  const pending = cur.pendingPct;
  return {
    id: "timing", mode: "observed", label: "When", tone: late ? "bad" : "neutral",
    text:
      `**${fmtPct0(cur.postPct)}** cancel ${link("after the due date", hrefs.postOdd(month, state))}` +
      (prev?.postPct != null ? ` (${fmtPct0(prev.postPct)} in the previous period; portfolio ${fmtPct0(port.postPct)})` : ` (portfolio ${fmtPct0(port.postPct)})`) +
      (pending !== null ? `. ${link("Pending Customer Contact", hrefs.watchtower(month, state))}: **${fmtPct0(pending)}**${prev?.pendingPct != null ? ` (from ${fmtPct0(prev.pendingPct)})` : ""}.` : "."),
    evidence: { kind: "timing", scope, title: `${name} cancellation timing`, interpretation: late ? "Customers here are lost late, after the committed date: an appointment journey problem." : "The timing mix is close to the portfolio; no late stage concentration." },
  };
}

export function buildScopeNarrative(model: DataModel, month: MonthKey, scope: string): NarrativePoint[] {
  const f = storyFacts(model, month);
  const name = scopeName(scope);
  const pm = prevMonth(model, month);
  const cur = getSnapshot(model, month, scope);
  const prev = pm ? getSnapshot(model, pm, scope) : null;
  const port = getSnapshot(model, month, null);
  const out: NarrativePoint[] = [changePoint(model, month, scope, cur, prev)];
  const st = model.story;

  if (!isChannel(scope)) {
    // Channels inside this state
    const rows = month === model.drillMonth ? model.stateChannel.filter((r) => r.state === scope).sort((a, b) => (b.cancelRate ?? 0) - (a.cancelRate ?? 0)) : [];
    if (rows.length) {
      const isFocus = f.focus?.state === scope;
      const outl = isFocus ? f.outlierChannels.map((c) => c.channel) : [];
      const rest = rows.filter((r) => !outl.includes(r.channel)).map((r) => r.cancelRate);
      const restRange = rest.length ? ([Math.min(...(rest as number[])), Math.max(...(rest as number[]))] as [number, number]) : null;
      out.push({
        id: "channels", mode: "observed", label: "Which channels", tone: outl.length ? "bad" : "neutral",
        text: outl.length
          ? `${listJoin(outl.map((c) => channelLink(c, month)))} cancel ${listJoin(outl.map((c) => `**${fmtPct(rows.find((r) => r.channel === c)?.cancelRate ?? null)}**`))} of sales; other channels ${between(restRange)}.`
          : `All channels cancel ${between(restRange)} of sales; none stands out.`,
        evidence: { kind: "scope-channels", state: scope, highlight: outl, title: `${name} cancel rate by channel`, interpretation: outl.length ? `The problem is concentrated in ${listJoin(outl)}.` : "Every channel is close to the others." },
      });
    }
    if (f.hasStory && f.focus?.state === scope) {
      const s = f.drivers.sales, c = f.drivers.contact, co = f.drivers.company;
      if (s && c) {
        out.push({
          id: "drivers", mode: "observed", label: "Why", tone: "bad",
          text: `Two problems: sales quality (**${fmtInt(s.cancels)}**, ${fmtPct0(s.share)}) and the bigger one, customer contact (**${fmtInt(c.cancels)}**, ${fmtPct0(c.share)}).` + (co ? ` Operational causes add ${fmtPct0(co.share)}.` : ""),
          evidence: { kind: "drivers", title: `${name} primary driver attribution`, interpretation: "One primary cause per order; the two largest causes need different owners and different fixes." },
        });
      }
    }
  } else {
    // States inside this channel
    const ch = name;
    const rows = month === model.drillMonth ? model.stateChannel.filter((r) => r.channel === ch).sort((a, b) => (b.cancelRate ?? 0) - (a.cancelRate ?? 0)) : [];
    if (rows.length) {
      const top = rows[0];
      const rest = rows.slice(1).map((r) => r.cancelRate).filter((x): x is number => x !== null);
      const stands = rest.length && (top.cancelRate ?? 0) - Math.max(...rest) > 0.08;
      out.push({
        id: "states", mode: "observed", label: "Geography", tone: stands ? "bad" : "neutral",
        text: stands
          ? `The increase sits in ${stateLink(top.state, month)} at **${fmtPct(top.cancelRate)}**; elsewhere ${ch} runs ${between([Math.min(...rest), Math.max(...rest)])}.`
          : `${ch} cancel rates range ${between([Math.min(...rows.map((r) => r.cancelRate ?? 0)), Math.max(...rows.map((r) => r.cancelRate ?? 0))])} across states; no state stands out.`,
        evidence: { kind: "channel-states", channel: ch, highlight: stands ? [top.state] : [], title: `${ch} cancel rate by state`, interpretation: stands ? `${ch} is healthy outside ${top.state}; the channel problem is local.` : `${ch} behaves consistently across the footprint.` },
      });
    }
    if (f.hasStory && f.focus) {
      const ag = st.agencies.filter((a) => a.channel === ch);
      const weak = ag.filter((a) => f.weakAgencies.includes(a));
      if (ag.length) {
        out.push({
          id: "agencies", mode: "observed", label: "Sales quality analysis", tone: weak.length ? "bad" : "neutral",
          text: weak.length
            ? `In ${f.focus.state}, ${listJoin(weak.map((a) => `${a.agency} moved from its own ${fmtPct(a.baseline)} history to **${fmtPct(a.cancelRate)}**`))}.`
            : `In ${f.focus.state}, ${listJoin(ag.map((a) => `${a.agency} stayed near its own history (${fmtPct(a.cancelRate)} vs ${fmtPct(a.baseline)})`))}.`,
          evidence: { kind: "agencies", highlight: weak.map((a) => a.agency), title: `${f.focus.state} agencies vs own history`, interpretation: weak.length ? "The deterioration follows specific partners, not the channel as a whole." : "Agencies in this channel are performing to their own history." },
        });
      }
    }
  }

  const tp = scopeTimingPoint(month, scope, cur, prev, port);
  if (tp) out.push(tp);

  // Forward-looking outlook for this scope
  if (f.hasStory && f.forecast.month) {
    const FM = monthName(f.forecast.month);
    if (!isChannel(scope)) {
      const r = st.forecastStates.find((x) => x.state === scope);
      if (r) {
        const worse = (r.rate ?? 0) - (r.prevRate ?? 0) > 0.02;
        out.push({
          id: "outlook", mode: "preventive", label: `${FM} risk outlook`, tone: worse ? "warn" : "good",
          text: worse
            ? `Over the next ${hz(f.model)} days, without action, ${name} is projected at **${fmtPct(r.rate)}** on ${fmtInt(r.sales)} sales (${monthName(month)} ${fmtPct(r.prevRate)}). See the ${link("recommended interventions", hrefs.actions(month))}.`
            : `Over the next ${hz(f.model)} days ${name} is projected at **${fmtPct(r.rate)}**, in line with ${monthName(month)} (${fmtPct(r.prevRate)}); no intervention is required here.`,
          evidence: { kind: "forecast-scope", scope, title: `${name}: ${monthName(month)} actual vs ${FM} outlook`, interpretation: worse ? `Without intervention ${name} deteriorates further over the next 30 days.` : `${name} is expected to stay near its normal level.` },
        });
      }
    } else if (f.focus) {
      const r = st.forecastChannels.find((x) => !x.isTotal && x.channel === name);
      if (r) {
        const worse = (r.delta ?? 0) > 0.03;
        out.push({
          id: "outlook", mode: "preventive", label: `${FM} risk outlook`, tone: worse ? "warn" : "good",
          text: `In ${f.focus.state}, ${name} is projected at **${fmtPct(r.rate)}** over the next ${hz(f.model)} days without action (${monthName(month)} ${fmtPct(r.prevRate)}, internal baseline ${fmtPct(r.baseline)}).`,
          evidence: { kind: "forecast-scope", scope, title: `${f.focus.state} ${name}: ${FM} outlook`, interpretation: worse ? "The channel keeps deteriorating unless risky orders are verified before installation." : "The channel stays close to its internal baseline." },
        });
      }
    }
  }
  return out.slice(0, 5);
}

// ------------------------------------------------------------------ "What is happening?" for the plan overview
export function buildPlanNarrative(model: DataModel, month: MonthKey): NarrativePoint[] {
  const f = storyFacts(model, month);
  const M = monthName(month);
  const out: NarrativePoint[] = [];
  const rows = stateRows(model, month);
  if (!f.focus) {
    out.push({
      id: "geography", mode: "observed", label: "Geography", tone: "good",
      text: `No state is outside its normal range in ${M}: cancellation growth ranges between ${growthRange([Math.min(...rows.map((r) => r.cancelsMoM ?? 0)), Math.max(...rows.map((r) => r.cancelsMoM ?? 0))])}.`,
      evidence: { kind: "ranking", dim: "state", metric: "cancelRate", highlight: [], title: `Cancel rate by state, ${M}`, interpretation: "States sit close together; no plan is required beyond routine monitoring." },
    });
    return out;
  }
  const g = geographyPoint(f);
  if (g) out.push({ ...g, text: g.text.replace(" explains ", " is the only state outside its normal range and explains ") });
  const top = f.portfolioChannels.filter((c) => (c.contribution ?? 0) > 0.25);
  if (top.length) {
    out.push({
      id: "channels", mode: "observed", label: "Channel", tone: "bad",
      text: `By channel, ${listJoin(top.map((c) => channelLink(c.channel, month)))} account for ${listJoin(top.map((c) => `**${fmtPct0(c.contribution)}**`))} of the portfolio increase.`,
      evidence: { kind: "ranking", dim: "channel", metric: "cancels", highlight: top.map((c) => c.channel), title: `Cancellations by channel, ${M}`, interpretation: `${listJoin(top.map((c) => c.channel))} drive the increase; the other channels moved little.` },
    });
  }
  if (f.outlierChannels.length) {
    const names = f.outlierChannels.map((c) => c.channel);
    const elsewhere = model.stateChannel.filter((r) => names.includes(r.channel) && r.state !== f.focus!.state).map((r) => r.cancelRate).filter((x): x is number => x !== null);
    out.push({
      id: "intersection", mode: "observed", label: "Where they meet", tone: "bad",
      text:
        `The deterioration sits where the two meet: ${f.focus.state} ${listJoin(names)} at ${listJoin(f.outlierChannels.map((c) => `**${fmtPct(c.rate)}**`))}` +
        (elsewhere.length ? `, while the same channels in other states run ${between([Math.min(...elsewhere), Math.max(...elsewhere)])}.` : "."),
      evidence: { kind: "scope-channels", state: f.focus.state, highlight: names, title: `${f.focus.state} cancel rate by channel`, interpretation: "A plan for these channels in this state addresses most of the exception." },
    });
  }
  if (f.hasStory && f.forecastFocus && f.forecast.month) {
    out.push({
      id: "outlook", mode: "preventive", label: `${monthName(f.forecast.month)} risk outlook`, tone: "warn",
      text: `Over the next ${hz(f.model)} days, without action, ${f.focus.state} is projected at **${fmtPct(f.forecastFocus.rate)}**` + (f.forecastOthers ? ` while every other state stays ${between(f.forecastOthers)}.` : "."),
      evidence: { kind: "forecast-scope", scope: f.focus.state, title: `${monthName(f.forecast.month)} outlook by state`, interpretation: `The outlook confirms ${f.focus.state} as the place to act; the rest of the footprint stays near normal.` },
    });
  }
  return out;
}
