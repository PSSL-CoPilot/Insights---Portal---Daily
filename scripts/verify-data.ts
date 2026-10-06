import { loadDataModel } from "../lib/data/excelLoader";
import { fmtInt, fmtPct, fmtPct0, fmtSignedPct } from "../lib/format";
import { getSnapshot } from "../lib/data/metrics";
import { defaultKey, rangeModel } from "../lib/data/daily";
const base = loadDataModel();
const m = rangeModel(base, process.env.RANGE || defaultKey(base));
console.log("ok:", m.ok, "| months:", m.months.join(","), "| latest:", m.latestMonth, "| drill:", m.drillMonth, "| watch:", m.watchMonth);
console.log("states:", m.states.join(", "));
console.log("sheets:", m.meta.sheets.map((s) => `${s.name}(${s.rows})`).join(" | "));
console.log("issues:", m.issues);
console.log("kpiCards[0..2]:", m.kpiCards.slice(0, 3), "hotspot:", m.hotspotBlock.length);
console.log("monthly last:", m.monthlyOverview.at(-1));
console.log("stateDrill NC:", m.stateDrill.find((s) => s.state === "North Carolina"));
console.log("reasons NC Sep:", m.customerMissReasons.filter((r) => r.state === "North Carolina" && r.month === m.latestMonth));
console.log("watch:", m.watchtower.find((w) => w.state === "North Carolina"), m.watchtower.find((w) => w.isPortfolio));
console.log("journey:", m.journey.map((j) => `${j.step} ${j.date} ${j.event}`));
console.log("questions:", m.executiveQuestions.length, "dictionary:", m.dictionary.length, "channels:", m.channels);
const sumReason = (r: string) => m.customerMissReasons.filter((x) => x.month === m.latestMonth && x.reason === r).reduce((a, x) => a + (x.count ?? 0), 0);
for (const r of ["Buyer’s Remorse", "Customer Requested Cancel", "No Access / Not Home", "Customer Requested Reschedule", "Cancelled while Tech on Job", "Other Customer Miss"]) console.log(r, sumReason(r));

// ---------------------------------------------------------------- story reconciliation
import { buildExecutiveNarrative, buildPlanNarrative, buildScopeNarrative } from "../lib/story/narrative";
import { buildStoryScenes } from "../lib/story/scenes";
import { riskFactors, storyFacts } from "../lib/story/facts";
import { buildActions } from "../lib/data/narratives";
import { chScope } from "../lib/data/metrics";
import { buildAgencyNarrative, buildOverviewNarrative, buildRepNarrative, buildStateChannelNarrative } from "../lib/story/analysis";
import { buildActionsNarrative, buildCancellationsNarrative, buildJourneyNarrative, buildWatchtowerNarrative } from "../lib/story/pages";

const fails: string[] = [];
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) fails.push(msg); };
const month = m.latestMonth!;
const f = storyFacts(m, month);
const st = m.story;
check(f.hasStory && st.focusState === f.focus?.state, `story sheets describe the detected focus state (${st.focusState})`);
const focusCancels = m.stateMonthly.find((r) => r.month === month && r.state === st.focusState)?.cancels;
const driverParts = st.drivers.filter((d) => d.kind !== "total").reduce((a, d) => a + (d.cancels ?? 0), 0);
check(driverParts === focusCancels, `primary drivers sum to ${driverParts} = ${st.focusState} cancellations ${focusCancels}`);
const contactShare = f.drivers.contact?.share ?? null, pending = f.focusSnap?.pendingPct ?? null;
check(contactShare !== null && pending !== null && Math.round(contactShare * 100) !== Math.round(pending * 100), `contact attribution ${(contactShare! * 100).toFixed(0)}% is kept distinct from the Pending Customer Contact signal ${(pending! * 100).toFixed(0)}%`);
const fs_ = st.forecastStates.filter((r) => !r.isTotal), fsTot = st.forecastStates.find((r) => r.isTotal);
check(fs_.reduce((a, r) => a + (r.cancels ?? 0), 0) === fsTot?.cancels, `forecast state cancels reconcile to the total (${fsTot?.cancels})`);
const noAct = st.outcomes.find((o) => o.kind === "noAction"), withAct = st.outcomes.find((o) => o.kind === "intervention"), prevented = st.outcomes.find((o) => o.kind === "prevented");
check(noAct?.cancels === fsTot?.cancels && Math.abs((noAct!.cancels! / fsTot!.sales!) - (f.forecast.noAction ?? 0)) < 0.0005, `no action outlook ${(f.forecast.noAction! * 100).toFixed(1)}% = ${noAct?.cancels} / ${fsTot?.sales}`);
check((noAct?.cancels ?? 0) - (prevented?.cancels ?? 0) === withAct?.cancels && Math.abs(withAct!.cancels! / fsTot!.sales! - (f.forecast.intervention ?? 0)) < 0.0005, `intervention outlook ${(f.forecast.intervention! * 100).toFixed(1)}% = (${noAct?.cancels} − ${prevented?.cancels}) / ${fsTot?.sales}`);
const layers = st.interventions.filter((i) => i.kind !== "total").reduce((a, i) => a + (i.saves ?? 0), 0);
const dedup = st.interventions.find((i) => i.kind === "total")?.saves;
check(dedup === prevented?.cancels && (dedup ?? 0) <= layers, `deduplicated saves ${dedup} = prevented cancellations, and not more than the layer sum ${layers}`);
const ex = buildExecutiveNarrative(m, month);
const exText = ex.points.map((p) => p.text).join(" ");
check(exText.includes(`**${fmtPct0(f.drivers.contact?.share ?? null)}**`) && exText.includes(`**${fmtPct0(f.focusSnap?.pendingPct ?? null)}**`), "executive story states both the contact attribution and the Pending Customer Contact signal");
check(ex.points.some((p) => p.id === "sales-quality") && ex.points.some((p) => p.id === "contact"), "executive story carries both causes");
const totalSaves = fmtInt(f.interventions.total?.saves ?? null);
check((exText.match(new RegExp(`\\*\\*${totalSaves}\\*\\*`, "g")) ?? []).length === 1, `${totalSaves} total saves appear once in the executive story (no double counting)`);
const actions = buildActions(m, month);
const saves = actions.reduce((a, x) => a + (x.saves ?? 0), 0);
check(saves === layers, `action saves (${saves}) equal the three prevention layers, each counted once`);
const scenes = buildStoryScenes(m, month);
const ov = buildOverviewNarrative(m, month);
check(ov.some((p) => p.id === "sales-quality") && ov.some((p) => p.id === "contact"), "Detailed Analysis overview names both problems");
const ids = ex.points.map((p) => p.id);
check(JSON.stringify(ids) === JSON.stringify(["portfolio", "detection", "geography", "channel", "sales-quality", "sales-prevention", "contact", "timing", "high-value", "outlook", "action"]), `story order: ${ids.join(" > ")}`);
check(ex.points[ids.indexOf("sales-prevention")]?.mode === "preventive" && ex.points[ids.indexOf("sales-quality")]?.mode === "observed", "sales quality prevention follows the problem and is marked forward-looking");
check(/cancellations increased \{\{bad:\d+%\}\} while Unique Sales increased \{\{good:\d+%\}\}/i.test(ex.headline), `quantified headline: ${ex.headline}`);
const sp = ex.points.find((p) => p.id === "sales-prevention")!;
check(sp.text.includes(fmtInt(f.riskyOrders.orders)) && sp.text.includes(`**${fmtInt(f.interventions.sales?.saves ?? null)}**`) && /^rep risk/i.test(sp.text.split("risk factors: ")[1] ?? "") && riskFactors(f).every((x, i, a) => !i || (a[i - 1].v ?? 0) >= (x.v ?? 0)) && riskFactors(f)[0].id === "rep", `sales quality prevention uses the forecast orders (${fmtInt(f.riskyOrders.orders)}), the ${f.interventions.sales?.saves} saves and the five risk factors, rep risk highest, in descending order`);
check(ex.points.find((p) => p.id === "sales-quality")?.evidence?.kind === "sales-quality", "sales quality insight carries agency and representative evidence");
const hv = ex.points.find((p) => p.id === "high-value");
check(!!hv && hv.mode === "preventive" && [f.highValue.total, f.highValue.accelerate?.orders, f.highValue.resetOdd?.orders, f.interventions.install?.saves].every((x) => hv.text.includes(`**${fmtInt(x ?? null)}**`)), `high-value customer protection uses the segmentation (${f.highValue.total}) and ${f.interventions.install?.saves} saves`);
// Day-wise consistency: every quick filter tells the same story (same state, channels and partners).
import { forecast, parseKey, presets, selScope, parseSel } from "../lib/data/daily";
// Outlook from the selected date: next 5 days about 17.8% to 17.1%, next 30 days trending to about 16.4%.
{
  const o = m.daily!.outlook!;
  // Shape of the outlook: about 4% lower over the next 5 days and about 8% lower over the next 30 days with the actions.
  const drop = (x: typeof o[5]) => 1 - (x.rateWith ?? 0) / (x.rateNo ?? 1);
  // Targets: next 5 days 18.3%, next 30 days 17.2% with the actions (from 19.4% without).
  check(Math.abs((o[5].rateWith ?? 0) - 0.183) < 0.0006 && Math.abs((o[30].rateWith ?? 0) - 0.172) < 0.0006 && drop(o[30]) > drop(o[5]),
    `outlook: next 5 days ${fmtPct(o[5].rateNo)} to ${fmtPct(o[5].rateWith)}, next 30 days ${fmtPct(o[30].rateNo)} to ${fmtPct(o[30].rateWith)}`);
  check(f.interventions.total?.saves === o[30].avoided && f.forecast.intervention === o[30].rateWith, "actions, saves and the outlook come from the same next 30 days");
  // Parts never add up to more than the whole: savings by state add up to the portfolio.
  const byState = m.states.reduce((a, s) => a + forecast(m, 30, { states: [s] }).avoided, 0);
  check(Math.abs(byState - o[30].avoided) <= m.states.length, `state savings add up to the portfolio (${byState} vs ${o[30].avoided})`);
  // A combination snapshot equals the sum of its cells.
  const sc = selScope({ states: ["North Carolina"], channels: ["D2D", "Digital Partner"] });
  const combo = getSnapshot(m, month, sc), cells = m.stateChannel.filter((r) => r.state === "North Carolina" && (r.channel === "D2D" || r.channel === "Digital Partner"));
  check(combo.cancels === cells.reduce((a, r) => a + (r.cancels ?? 0), 0) && combo.sales === cells.reduce((a, r) => a + (r.sales ?? 0), 0), `North Carolina D2D + Digital Partner combination = its cells (${combo.cancels} of ${combo.sales})`);
  const ag = getSnapshot(m, month, selScope({ agencies: ["Agency Alpha"] }));
  check(ag.cancels === m.story.agencies.find((a) => a.agency === "Agency Alpha")!.cancels, `Agency Alpha combination = its agency row (${ag.cancels})`);
  void parseSel;
}
for (const p of presets(base)) {
  const pm = rangeModel(base, p.key), pf = storyFacts(pm, p.key);
  const ok = pf.focus?.state === f.focus?.state && pf.outlierChannels.map((c) => c.channel).sort().join() === f.outlierChannels.map((c) => c.channel).sort().join() && pf.weakAgencies.map((a) => a.agency).sort().join() === "Agency Alpha,Agency Beta,Agency Gamma";
  const up = pf.d.cancelsMoM ?? 0;
  // Comparison period: the same number of days just before (month to date: the same days of the previous month).
  const [s0, e0] = parseKey(p.key), prevK = pm.baselineMonth, [ps, pe] = prevK ? parseKey(prevK) : ["", ""];
  const len = (a: string, b: string) => pm.daily!.dates.filter((d) => d >= a && d <= b).length;
  const prevOk = !!prevK && len(ps, pe) === len(s0, e0) && pe < s0;
  // Short windows ending today: cancellations up 10 to 25% and sales up against the window just before.
  const ds = pf.d.salesMoM ?? 0;
  check(p.id === "30" || (up >= 0.1 && up <= 0.25 && ds > 0), `${p.label}: cancellations ${fmtSignedPct(up)}, Unique Sales ${fmtSignedPct(ds)} vs the previous equal period`);
  check(ok && pf.d.anomaly && prevOk, `${p.label} vs ${prevK}: ${pf.focus?.state}, ${pf.outlierChannels.map((c) => c.channel).join(" + ")}, ${pf.weakAgencies.map((a) => a.agency.replace("Agency ", "")).join("/")}, cancellations ${fmtSignedPct(up)}`);
}
const seg = st.segments.filter((x) => !x.isTotal).reduce((a, x) => a + (x.orders ?? 0), 0);
check(seg === st.segments.find((x) => x.isTotal)?.orders, `delivery-risk segments sum to the total (${seg})`);
const scIds = buildStoryScenes(m, month).map((x) => x.id);
check(["sales-quality", "sales-prevention", "contact", "timing", "high-value"].every((id) => scIds.includes(id)) && scIds.indexOf("sales-prevention") === scIds.indexOf("sales-quality") + 1, `player retells the story: ${scIds.join(" > ")}`);
check(scenes.length === 13, `player builds ${scenes.length} scenes (expected 13)`);
const allText = [
  ex.headline, exText, ...ex.points.map((p) => `${p.label} ${p.evidence?.title ?? ""} ${p.evidence?.interpretation ?? ""}`),
  ...buildPlanNarrative(m, month).map((p) => p.text),
  ...[...m.states, ...m.channelNames.map(chScope)].flatMap((s) => buildScopeNarrative(m, month, s).map((p) => `${p.label} ${p.text} ${p.evidence?.interpretation ?? ""}`)),
  ...scenes.map((s) => `${s.kicker} ${s.title} ${s.body}`),
  ...actions.map((a) => `${a.title} ${a.why} ${a.impact} ${a.request} ${a.evidence.join(" ")}`),
  ...[
    ...buildOverviewNarrative(m, month),
    ...m.story.agencies.flatMap((a) => buildAgencyNarrative(m, month, a)),
    ...m.story.reps.slice(0, 20).flatMap((r) => buildRepNarrative(m, month, r)),
    ...m.channelNames.flatMap((c) => buildStateChannelNarrative(m, month, m.story.focusState!, c)),
    ...buildCancellationsNarrative(m, month, null), ...buildWatchtowerNarrative(m, month, null), ...buildActionsNarrative(m, month), ...buildJourneyNarrative(m, month),
  ].map((p) => `${p.label} ${p.text} ${p.evidence?.interpretation ?? ""}`),
].join(" ").replace(/\[\[[^|]+\|[^\]]+\]\]/g, (x) => x.split("|")[0]);
// Human contact-centre agents ("agent outreach", "agent call") are fine; backend agent names are not.
const scrubbed = allText.replace(/\bagent (outreach|call|queue|follow up)\b/gi, "");
const banned = scrubbed.match(/\b(agent|analyst|scenario|hotspot|hot)\b| - |–|—/gi);
check(!banned,`no backend agent names, "scenario", "hot" or dashes in story text${banned ? ` (found: ${[...new Set(banned)].join(", ")})` : ""}`);
if (fails.length) {
  console.error(`\n${fails.length} story check(s) failed.`);
  process.exit(1);
}
console.log("\nAll story checks passed.");
