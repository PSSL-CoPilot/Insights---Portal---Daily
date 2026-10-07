/**
 * Typed contract of the story engine. The Command Center summary, the "What is happening?"
 * narratives, every evidence panel and the guided player all consume these shapes, which are
 * built from the workbook backed model by `lib/story/*`. No figure is typed into a component.
 */
import type { MonthKey } from "../data/types";

/** OBSERVED: what the data shows happened. PREVENTIVE: forward-looking outlook or intervention. */
export type StoryMode = "observed" | "preventive";

export type StoryTone = "bad" | "warn" | "good" | "neutral";

/** Inline link to an entity in the app; rendered from `[[label|href]]` markup in narrative text. */
export interface EntityLink {
  label: string;
  href: string;
  kind: "state" | "channel" | "timing" | "watchtower" | "actions" | "other";
}

/** Evidence the "See evidence" toggle renders. Every variant reads its numbers from the model at render time. */
export type EvidenceSpec = { title: string; interpretation: string } & (
  | { kind: "trend"; scope: string | null }
  | { kind: "ranking"; dim: "state" | "channel"; metric: "cancels" | "cancelRate"; highlight: string[] }
  | { kind: "scope-channels"; state: string; highlight: string[] }
  | { kind: "channel-states"; channel: string; highlight: string[] }
  | { kind: "agencies"; highlight: string[] }
  | { kind: "cohorts"; agency: string }
  | { kind: "drivers" }
  | { kind: "timing"; scope: string | null }
  | { kind: "reasons"; scope: string | null }
  | { kind: "watch"; scope: string | null }
  | { kind: "forecast" }
  | { kind: "forecast-scope"; scope: string }
  | { kind: "interventions" }
  | { kind: "classification"; scope: string | null }
  | { kind: "agency-trend"; agency: string }
  | { kind: "agency-signals"; agency: string }
  | { kind: "reps"; agency: string; agencies?: string[]; highlight?: string }
  | { kind: "rep-signals"; rep: string }
  | { kind: "measures" }
  | { kind: "sales-quality" }
  | { kind: "sales-prevention" }
  | { kind: "high-value" }
);

export type EvidenceKind = EvidenceSpec["kind"];

export interface NarrativePoint {
  id: string;
  mode: StoryMode;
  /** Short category label, e.g. "Geography", "Sales quality analysis". */
  label: string;
  /** Sentence(s) with `**bold**` figures and `[[label|href]]` entity links. */
  text: string;
  tone: StoryTone;
  evidence?: EvidenceSpec;
}

export interface StorySection {
  id: string;
  eyebrow: string;
  /** Quantified headline; `{{bad:…}}` and `{{good:…}}` mark coloured values. */
  headline: string;
  /** One plain sentence under the headline. */
  subhead?: string;
  status: { label: string; tone: StoryTone } | null;
  points: NarrativePoint[];
}

export interface Recommendation {
  id: string;
  label: string;
  /** Potential saves for this layer (before deduplication). */
  saves: number | null;
  share: number | null;
  action: string;
  population: string;
  /** Matching action in the Action Center, when one exists. */
  actionId: string | null;
}

/** Visual a player scene shows. Each variant is drawn by `components/story/SceneVisual.tsx`. */
export type SceneVisual =
  | { kind: "map"; zoom: string | null; states: { name: string; value: number | null; label: string; severity: MapBand }[] }
  | { kind: "channels"; state: string; rows: { channel: string; rate: number | null; sales: number | null; outlier: boolean }[]; normal: [number, number] | null }
  | { kind: "agencies"; rows: { agency: string; channel: string; baseline: number | null; rate: number | null; gap: number | null; focus: string; cohort: { cohort: string; salesShare: number | null; cancelShare: number | null; rate: number | null } | null }[] }
  | { kind: "sales-signals"; signals: { label: string; value: number | null }[]; example: { label: string; value: string }[]; action: string; stats: { orders: number | null; projected: number | null; saves: number | null; month: string } | null }
  | { kind: "split"; total: number | null; parts: { kind: string; label: string; cancels: number | null; share: number | null; emphasis: boolean }[]; signal: number | null }
  | { kind: "timing"; rows: { label: string; pre: number | null; on: number | null; post: number | null; emphasis: boolean }[]; drivers: { label: string; count: number | null; mom: number | null }[] }
  | { kind: "journey"; nodes: { label: string; severity: "neutral" | "warning" | "critical"; badge?: string }[] }
  | { kind: "install"; segments: { label: string; orders: number | null; action: string; signal: string }[]; total: number | null; example: { label: string; value: string }[]; saves: number | null; period: string }
  | { kind: "contact"; funnel: { label: string; value: number | null }[]; rules: { label: string; value: string }[]; period: string }
  | { kind: "outlook"; steps: { label: string; rate: number | null; mode: StoryMode }[]; saves: number | null }
  | { kind: "recommendations"; items: Recommendation[]; total: number | null };

/** Map colour band of a state by its cancellation change: under 5%, 5 to 10%, 10 to 15%, 15% and above. */
export type MapBand = "low" | "mild" | "elevated" | "high";
export const mapBand = (v: number | null): MapBand => (v === null || v < 0.05 ? "low" : v < 0.1 ? "mild" : v < 0.15 ? "elevated" : "high");

/** Where the narration sits relative to the visual. Varies by scene so the briefing does not read as one column. */
export type SceneLayout = "top" | "bottom" | "left" | "right";

export interface StoryScene {
  id: string;
  mode: StoryMode;
  layout: SceneLayout;
  /** Chapter label shown above the title, e.g. "Geography". */
  kicker: string;
  title: string;
  /** Narration with `**bold**` figures. */
  body: string;
  visual: SceneVisual;
  /** Larger chapter label for the scenes that open a chapter of the story (portfolio and the two problems). */
  emphasis?: boolean;
  /** Autoplay dwell time in milliseconds. */
  duration: number;
}

export interface StoryModel {
  month: MonthKey;
  executive: StorySection;
  scenes: StoryScene[];
  recommendations: Recommendation[];
  dedupSaves: number | null;
}
