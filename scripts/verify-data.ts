import { loadDataModel } from "../lib/data/excelLoader";
import { fmtPct0 } from "../lib/format";
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
import { storyFacts } from "../lib/story/facts";
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
check((exText.match(/1,275/g) ?? []).length === 1, "1,275 appears once in the executive story (no double counting)");
const actions = buildActions(m, month);
const saves = actions.reduce((a, x) => a + (x.saves ?? 0), 0);
check(saves === layers, `action saves (${saves}) equal the three prevention layers, each counted once`);
const scenes = buildStoryScenes(m, month);
const ov = buildOverviewNarrative(m, month);
check(ov.some((p) => p.id === "sales-quality") && ov.some((p) => p.id === "contact"), "Detailed Analysis overview names both September problems");
const ids = ex.points.map((p) => p.id);
check(JSON.stringify(ids) === JSON.stringify(["portfolio", "detection", "geography", "channel", "sales-quality", "sales-prevention", "contact", "timing", "high-value", "outlook", "action"]), `story order: ${ids.join(" > ")}`);
check(ex.points[ids.indexOf("sales-prevention")]?.mode === "preventive" && ex.points[ids.indexOf("sales-quality")]?.mode === "observed", "sales quality prevention follows the problem and is marked forward-looking");
check(/\{\{bad:\+\d+%\}\}/.test(ex.headline) && /\{\{good:\+\d+%\}\}/.test(ex.headline), `quantified headline: ${ex.headline}`);
const sp = ex.points.find((p) => p.id === "sales-prevention")!;
check(sp.text.includes("6,700") && sp.text.includes("**500**") && f.riskyOrders.projected === 3422, "October sales quality prevention uses the forecast orders (6,700; 3,422 projected) and the 500 saves");
check(ex.points.find((p) => p.id === "sales-quality")?.evidence?.kind === "sales-quality", "sales quality insight carries agency and representative evidence");
const hv = ex.points.find((p) => p.id === "high-value");
check(!!hv && hv.mode === "preventive" && ["**650**", "**150**", "**185**", "**175**"].every((x) => hv.text.includes(x)), "high-value customer protection uses the segmentation (650: 150 accelerate, 185 reset ODD) and 175 saves");
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
