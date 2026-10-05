/**
 * Top-of-page insights for Cancellations, Watchtower, Actions, Journey and Insights.
 * Each read-out follows the page's scope (state filter) and uses the same facts as the
 * Command Center story, so the pages never disagree.
 */
import type { DataModel, MonthKey } from "../data/types";
import { buildActions } from "../data/narratives";
import { getSnapshot, prevMonth, reasonStats, stateRows, watchSignals } from "../data/metrics";
import { fmtInt, fmtPct, fmtPct0, fmtPp, fmtSignedPct, monthName } from "../format";
import { storyFacts } from "./facts";
import { buildExecutiveNarrative, buildRecommendations } from "./narrative";
import { agencyLink, hrefs, link, listJoin, stateLink } from "./links";
import type { NarrativePoint } from "./types";

const abs = (s: string) => s.replace(/^[+−]/, "");

// ------------------------------------------------------------------ Cancellations
export function buildCancellationsNarrative(model: DataModel, month: MonthKey, scope: string | null): NarrativePoint[] {
  const f = storyFacts(model, month);
  const pm = prevMonth(model, month);
  const s = getSnapshot(model, month, scope), p = pm ? getSnapshot(model, pm, scope) : null;
  const where = scope ?? "the portfolio";
  const out: NarrativePoint[] = [];
  const cMoM = s.cancels !== null && p?.cancels ? s.cancels / p.cancels - 1 : null;
  out.push({
    id: "volume", mode: "observed", label: "Volume", tone: (cMoM ?? 0) > 0.1 ? "bad" : "neutral",
    text: `**${fmtInt(s.cancels)}** cancellations in ${where}, {{${(cMoM ?? 0) > 0.005 ? "bad" : (cMoM ?? 0) < -0.005 ? "good" : "neutral"}:${fmtSignedPct(cMoM)}}} vs ${pm ? monthName(pm) : "prior month"}. Cancel rate **${fmtPct(s.cancelRate)}**${p?.cancelRate != null ? ` (from ${fmtPct(p.cancelRate)})` : ""}.`,
    evidence: { kind: "trend", scope, title: `${scope ?? "Portfolio"} cancel rate by day`, interpretation: (cMoM ?? 0) > 0.1 ? "The rate broke out of its usual range this month." : "The rate is within its usual range." },
  });
  if (s.postPct !== null) {
    const shift = p?.postPct != null ? s.postPct - p.postPct : null;
    out.push({
      id: "timing", mode: "observed", label: "When customers cancel", tone: (shift ?? 0) > 0.03 ? "bad" : "neutral",
      text: `**${fmtPct0(s.postPct)}** cancel after the Original Due Date${shift !== null ? ` (${fmtPp(shift)})` : ""}; Pre ODD ${fmtPct0(s.prePct)} and On ODD ${fmtPct0(s.onPct)}.`,
      evidence: { kind: "timing", scope, title: "Pre, On and Post ODD share by day", interpretation: (shift ?? 0) > 0.03 ? "The mix moved toward late stage loss, after the committed date." : "The lifecycle mix is stable." },
    });
  }
  if (s.custPct !== null) {
    const showAdj = f.hasStory && f.reclassMoved && (scope === null || scope === f.focus?.state);
    out.push({
      id: "class", mode: "observed", label: "Who owns the miss", tone: s.custPct > 0.7 ? "bad" : "neutral",
      text: `Customer Miss is **${fmtPct0(s.custPct)}** (${fmtInt(s.custMiss)}), Company Miss ${fmtPct0(s.coPct)} and Faux ${fmtPct0(s.fauxPct)}.` +
        (showAdj ? ` Reviewing the journey evidence moves ${fmtInt(f.reclassMoved)} ${f.focus!.state} cancellations from Customer Miss to Company Miss.` : ""),
      evidence: { kind: "classification", scope, title: "Cancellation classification", interpretation: "Most cancellations are recorded as customer side; part of that is preceded by a Brightspeed failure." },
    });
  }
  const late = reasonStats(model, month, scope).filter((r) => r.lateStage && (r.mom ?? 0) > 0.25).sort((a, b) => (b.mom ?? 0) - (a.mom ?? 0));
  if (late.length) {
    out.push({
      id: "reasons", mode: "observed", label: "Why customers cancel", tone: "bad",
      text: `${listJoin(late.map((r) => `${r.label} (${fmtSignedPct(r.mom)})`))} grew fastest: customers who are not ready or available at the appointment.`,
      evidence: { kind: "reasons", scope, title: "Customer Miss reasons", interpretation: "These reasons point to the appointment journey, not to a change of mind at the point of sale." },
    });
  }
  if (!scope && f.focus) {
    out.push({
      id: "where", mode: "observed", label: "Where", tone: "bad",
      text: `${stateLink(f.focus.state, month)} contributes **${fmtPct0(f.focus.contribution)}** of the increase; ${f.focusSnap?.postPct != null ? `${fmtPct0(f.focusSnap.postPct)} of its cancellations are Post ODD.` : ""}`,
      evidence: { kind: "ranking", dim: "state", metric: "cancels", highlight: [f.focus.state], title: "Cancellations by state", interpretation: `${f.focus.state} is the only state outside its normal range.` },
    });
  }
  return out.slice(0, 5);
}

// ------------------------------------------------------------------ Watchtower
export function buildWatchtowerNarrative(model: DataModel, month: MonthKey, scope: string | null): NarrativePoint[] {
  const f = storyFacts(model, month);
  const sig = watchSignals(model, month, scope);
  if (!sig.some((x) => x.pct !== null)) return [];
  const pm = prevMonth(model, month);
  const prev = pm ? getSnapshot(model, pm, scope) : null;
  const s = getSnapshot(model, month, scope);
  const where = scope ?? "the portfolio";
  const flagged = sig.filter((x) => x.actionable).reduce((a, x) => a + (x.pct ?? 0), 0);
  const pending = sig.find((x) => x.id === "pending");
  const out: NarrativePoint[] = [{
    id: "flagged", mode: "observed", label: "Visible in advance", tone: "warn",
    text: `**${fmtPct0(flagged)}** of ${monthName(month)} cancellations in ${where} carried a Watchtower warning before they cancelled${s.cancels ? `: about ${fmtInt(Math.round(flagged * s.cancels))} of ${fmtInt(s.cancels)} orders` : ""}.`,
    evidence: { kind: "watch", scope, title: "Watchtower state before cancellation", interpretation: "Most of the loss was visible before it happened." },
  }];
  if (pending?.pct != null) {
    out.push({
      id: "pending", mode: "observed", label: "Leading signal", tone: "bad",
      text: `${link("Pending Customer Contact", hrefs.watchtower(month, scope))} leads at **${fmtPct0(pending.pct)}**${prev?.pendingPct != null ? ` (${fmtPp(pending.pct - prev.pendingPct)})` : ""}. Install in Jeopardy (${fmtPct0(s.jeopardyPct)}) and BSW Delay (${fmtPct0(s.bswPct)}) stay low: a customer engagement problem, not a build one.`,
      evidence: { kind: "watch", scope, title: "Watchtower signals", interpretation: "Customer contact warnings are materially stronger than technical risk." },
    });
  }
  if (!scope && f.focus && f.focusSnap?.pendingPct != null) {
    const others = stateRows(model, month).filter((r) => r.state !== f.focus!.state).map((r) => r.pendingPct).filter((x): x is number => x !== null);
    out.push({
      id: "where", mode: "observed", label: "Where", tone: "bad",
      text: `${stateLink(f.focus.state, month)} carries Pending Customer Contact on **${fmtPct0(f.focusSnap.pendingPct)}** of its cancellations${others.length ? `, against ${fmtPct0(Math.min(...others)) === fmtPct0(Math.max(...others)) ? `about ${fmtPct0(Math.min(...others))}` : `${fmtPct0(Math.min(...others))} to ${fmtPct0(Math.max(...others))}`} elsewhere` : ""}.`,
      evidence: { kind: "watch", scope: f.focus.state, title: `${f.focus.state} Watchtower signals`, interpretation: "The early warning is concentrated where the exception is." },
    });
  }
  // Agency and representative bands (the partner and rep data comes from Watchtower).
  if (f.hasStory && f.focus && (!scope || scope === f.focus.state)) {
    const active = model.story.reps.filter((r) => (r.sales ?? 0) > 0);
    const crit = active.filter((r) => /critical/i.test(r.band));
    const byAgency = [...new Set(crit.map((r) => r.agency))].map((ag) => ({ ag, n: crit.filter((r) => r.agency === ag).length })).sort((a, b) => b.n - a.n);
    const steadyNames = new Set(f.steadyAgencies.map((a) => a.agency));
    const steadyCrit = crit.filter((r) => steadyNames.has(r.agency)).length;
    if (crit.length) {
      out.push({
        id: "reps", mode: "observed", label: "Agencies and reps", tone: "bad",
        text: `Watchtower rates **${crit.length} of ${active.length}** active partner reps in ${f.focus.state} Critical (above 40% cancelled): ${listJoin(byAgency.map((x) => `${x.n} at ${agencyLink(x.ag, month)}`))}.${steadyCrit === 0 && f.steadyAgencies.length ? " The agencies on their normal history have none." : ""}`,
        evidence: { kind: "sales-quality", title: `${f.focus.state} agencies and representatives`, interpretation: "The Critical reps sit inside the agencies that broke from their own history." },
      });
    }
  }

  const cr = f.contactRisk;
  if (f.hasStory && cr.orders !== null && (!scope || scope === f.focus?.state)) {
    out.push({
      id: "rescue", mode: "preventive", label: "Customer-contact rescue", tone: "warn",
      text: `**${fmtInt(cr.orders)}** ${f.focus!.state} orders carry contact risk now; about ${fmtInt(cr.projected)} would cancel without help and cause-specific rescue can protect about **${fmtInt(cr.protectable)}**. ${link("Take action", hrefs.actions(month))}.`,
      evidence: { kind: "interventions", title: "Prevention layers", interpretation: "Contact rescue is the largest of the three prevention layers." },
    });
  }
  return out;
}

// ------------------------------------------------------------------ Actions
export function buildActionsNarrative(model: DataModel, month: MonthKey): NarrativePoint[] {
  const f = storyFacts(model, month);
  const rec = buildRecommendations(model, month);
  const actions = buildActions(model, month);
  const out: NarrativePoint[] = [];
  if (rec.items.length) {
    out.push({
      id: "layers", mode: "preventive", label: "Recommended intervention", tone: "warn",
      text: `Three actions answer the two ${monthName(month)} problems: ${listJoin(rec.items.map((r) => `${r.label.toLowerCase()} (**${fmtInt(r.saves)}**)`))}.${rec.dedup !== null ? ` About **${fmtInt(rec.dedup)}** cancellations avoided, each order counted once.` : ""}`,
      evidence: { kind: "interventions", title: "Potential saves by intervention", interpretation: "Customer-contact rescue is the largest lever; sales quality verification is the fastest to start." },
    });
  }
  if (f.forecast.noAction !== null) {
    out.push({
      id: "outlook", mode: "preventive", label: `${f.forecast.month ? monthName(f.forecast.month) : "Next month"} outlook`, tone: "warn",
      text: `Without action the cancel rate reaches **${fmtPct(f.forecast.noAction)}**; with these actions about **${fmtPct(f.forecast.intervention)}**, back toward the ${fmtPct(f.forecast.baseline)} internal baseline.`,
      evidence: { kind: "forecast", title: "Actual, outlook and intervention", interpretation: "Acting now turns a further rise into the first recovery step." },
    });
  }
  const crit = actions.filter((a) => a.priority === "Critical");
  if (crit.length) {
    out.push({
      id: "priority", mode: "preventive", label: "Priorities", tone: "neutral",
      text: `Start with: ${listJoin(crit.map((a) => `**${a.title}** (${a.owner})`))}.`,
    });
  }
  if (model.story.measures.length && f.hasStory) {
    const m = model.story.measures.slice(0, 3);
    out.push({
      id: "measures", mode: "preventive", label: "How we will know it is working", tone: "neutral",
      text: `${listJoin(m.map((x) => `${x.measure} from ${x.actual} to **${x.target}**`))}.`,
      evidence: { kind: "measures", title: "Success measures", interpretation: "Leading and lagging measures tracked weekly against the baseline month." },
    });
  }
  if (!out.length) {
    out.push({ id: "none", mode: "observed", label: "Actions", tone: "good", text: `${monthName(month)} is in line with trend; the actions below are routine monitoring.` });
  }
  return out;
}

// ------------------------------------------------------------------ Journey
export function buildJourneyNarrative(model: DataModel, month: MonthKey): NarrativePoint[] {
  const f = storyFacts(model, month);
  const s = getSnapshot(model, month, null);
  const out: NarrativePoint[] = [];
  if (s.sales) {
    out.push({
      id: "lifecycle", mode: "observed", label: "Lifecycle", tone: "neutral",
      text: `Of ${fmtInt(s.sales)} ${monthName(month)} orders, ${fmtInt(s.installs)} installed and ${fmtInt(s.cancels)} cancelled; **${fmtPct0(s.postPct)}** of the cancellations came after the Original Due Date.`,
      evidence: { kind: "timing", scope: null, title: "Cancellation timing by day", interpretation: "Late stage loss is where the journey breaks." },
    });
  }
  const path = model.workbookNotes.journeyPath?.replace(/\.$/, "");
  if (path) {
    out.push({
      id: "path", mode: "observed", label: "A typical failing journey", tone: "bad",
      text: `${path.charAt(0).toUpperCase()}${path.slice(1)}.`,
    });
  }
  if (f.focus && f.focusSnap?.pendingPct != null) {
    out.push({
      id: "signal", mode: "observed", label: "Visible before the loss", tone: "warn",
      text: `${fmtPct0(f.focusSnap.pendingPct)} of ${stateLink(f.focus.state, month)} cancellations carried ${link("Pending Customer Contact", hrefs.watchtower(month, f.focus.state))} first: the journey can be rescued before dispatch.`,
      evidence: { kind: "watch", scope: f.focus.state, title: "Watchtower signals", interpretation: "Each unresolved step is a chance to intervene." },
    });
  }
  if (f.cohort) {
    out.push({
      id: "origin", mode: "observed", label: "Where it starts", tone: "bad",
      text: `The representative journey begins with a promotional sale by a new ${agencyLink(f.cohort.agency, month)} representative; that cohort made ${fmtPct0(f.cohort.salesShare)} of the agency's sales and ${fmtPct0(f.cohort.cancelShare)} of its cancellations.`,
      evidence: { kind: "cohorts", agency: f.cohort.agency, title: `${f.cohort.agency} cohorts`, interpretation: "The journey's weak start and weak finish are two separate problems." },
    });
  }
  return out;
}

// ------------------------------------------------------------------ Insights
export function buildInsightsNarrative(model: DataModel, month: MonthKey): NarrativePoint[] {
  return buildExecutiveNarrative(model, month).points;
}

export { abs };
