// The domain IP: the observation library. Editing this file changes what
// coordinators can tap and how the narrative reads. Kept separate from UI on purpose.

export type Category = "CQ" | "DOC" | "IDX" | "SW" | "NP" | "CI";
export type Polarity = "positive" | "negative";
export type Impact = "low" | "medium" | "high" | "critical";

export interface Observation {
  id: string;
  cat: Category;
  label: string;      // what the coordinator sees/taps
  pol: Polarity;
  impact: Impact;
  frag: string;       // a composable CLAUSE, not a full sentence
  rec?: string;       // recommendation id
  excludes?: string[];
  mergesWith?: string[];
  crit?: 1 | 2;       // critical floor level (legacy — kept for old-report compatibility)
}

export const CATEGORIES: { id: Category; name: string }[] = [
  { id: "CQ", name: "Checking Quality" },
  { id: "DOC", name: "Documentation" },
  { id: "IDX", name: "Index" },
  { id: "SW", name: "Student Work" },
  { id: "NP", name: "Notebook Presentation" },
  { id: "CI", name: "Critical Issues" },
];

export const IMPACT_WEIGHT: Record<Impact, number> = { low: 1, medium: 2.5, high: 4, critical: 8 };

export const OBSERVATIONS: Observation[] = [
  { id: "CQ.regular", cat: "CQ", label: "Checked regularly", pol: "positive", impact: "low", frag: "the notebook is checked regularly by the subject teacher" },
  { id: "CQ.dated", cat: "CQ", label: "Checking is dated", pol: "positive", impact: "low", frag: "each check is consistently dated" },
  { id: "CQ.corrected", cat: "CQ", label: "Corrections marked & signed", pol: "positive", impact: "low", frag: "corrections are clearly marked and signed" },
  { id: "CQ.irregular", cat: "CQ", label: "Checking irregular", pol: "negative", impact: "medium", frag: "checking has been irregular over the assessed period", rec: "regular_checking" },
  { id: "CQ.not_this_cycle", cat: "CQ", label: "Not checked this cycle", pol: "negative", impact: "high", frag: "there is no evidence of checking in the current cycle", rec: "regular_checking", excludes: ["CQ.regular"] },
  { id: "CQ.superficial", cat: "CQ", label: "Checking superficial", pol: "negative", impact: "medium", frag: "checking appears superficial, with errors left unmarked", rec: "regular_checking" },

  { id: "DOC.complete", cat: "DOC", label: "Fully documented", pol: "positive", impact: "low", frag: "all classwork and homework is fully documented" },
  { id: "DOC.organized", cat: "DOC", label: "Well organized", pol: "positive", impact: "low", frag: "work is organised date-wise and topic-wise" },
  { id: "DOC.gaps", cat: "DOC", label: "Gaps in work", pol: "negative", impact: "medium", frag: "there are gaps in the documented work", rec: "document_gaps", mergesWith: ["DOC.missing_hw"] },
  { id: "DOC.missing_hw", cat: "DOC", label: "Homework missing", pol: "negative", impact: "medium", frag: "homework entries are missing for several dates", rec: "document_gaps", mergesWith: ["DOC.gaps"] },
  { id: "DOC.undated", cat: "DOC", label: "Entries not dated", pol: "negative", impact: "low", frag: "entries are not consistently dated", rec: "document_gaps" },

  { id: "IDX.complete", cat: "IDX", label: "Index complete", pol: "positive", impact: "low", frag: "the index is complete and up to date" },
  { id: "IDX.neat", cat: "IDX", label: "Index maintained neatly", pol: "positive", impact: "low", frag: "the index is maintained neatly" },
  { id: "IDX.partial", cat: "IDX", label: "Index incomplete", pol: "negative", impact: "low", frag: "the index is only partially filled", rec: "index", excludes: ["IDX.complete"] },
  { id: "IDX.absent", cat: "IDX", label: "No index", pol: "negative", impact: "medium", frag: "no index is maintained", rec: "index", excludes: ["IDX.complete", "IDX.neat"] },

  { id: "SW.neat", cat: "SW", label: "Neat & legible", pol: "positive", impact: "low", frag: "student work is neat and legible" },
  { id: "SW.effort", cat: "SW", label: "Consistent effort", pol: "positive", impact: "low", frag: "the work reflects consistent effort" },
  { id: "SW.diagrams", cat: "SW", label: "Diagrams well done", pol: "positive", impact: "low", frag: "diagrams and figures are well executed" },
  { id: "SW.untidy", cat: "SW", label: "Untidy in places", pol: "negative", impact: "low", frag: "handwriting and presentation are untidy in places", rec: "presentation", excludes: ["SW.neat"] },
  { id: "SW.incomplete", cat: "SW", label: "Work incomplete", pol: "negative", impact: "medium", frag: "several exercises are left incomplete", rec: "work_completion" },
  { id: "SW.copied", cat: "SW", label: "Work appears copied", pol: "negative", impact: "high", frag: "portions of the work appear copied rather than independently attempted", rec: "work_completion" },

  { id: "NP.maintained", cat: "NP", label: "Well maintained", pol: "positive", impact: "low", frag: "the notebook is well maintained overall" },
  { id: "NP.margins", cat: "NP", label: "Margins & headings used", pol: "positive", impact: "low", frag: "margins and headings are used consistently" },
  { id: "NP.covered", cat: "NP", label: "Covered & labelled", pol: "positive", impact: "low", frag: "the notebook is properly covered and labelled" },
  { id: "NP.worn", cat: "NP", label: "Worn / poorly kept", pol: "negative", impact: "low", frag: "the notebook is worn and poorly maintained", rec: "presentation", excludes: ["NP.maintained"] },
  { id: "NP.no_margins", cat: "NP", label: "No margins/headings", pol: "negative", impact: "low", frag: "margins and headings are not maintained", rec: "presentation" },

  { id: "CI.none", cat: "CI", label: "No critical issues", pol: "positive", impact: "low", frag: "no critical issues were observed" },
  // Reworded: "notebook not maintained" read ambiguously — teacher or child? —
  // and coordinators were plainly using it for the child's upkeep, ticking it
  // alongside CQ.dated (a positive teacher observation). Under the old rule it
  // forced "Critical" onto notebooks checked the same day. It is now clearly
  // the pupil's, and no longer sets the tag. Impact stays critical so it still
  // escalates; see attribution.ts for what may and may not set a tag.
  { id: "CI.not_maintained", cat: "CI", label: "Notebook poorly kept by student", pol: "negative", impact: "critical", frag: "the notebook is poorly kept by the student", rec: "escalate", crit: 2 },
  { id: "CI.no_teacher_check", cat: "CI", label: "No teacher checking at all", pol: "negative", impact: "critical", frag: "there is no evidence of teacher checking at all", rec: "escalate", crit: 2 },
  { id: "CI.long_gap", cat: "CI", label: "Prolonged gap", pol: "negative", impact: "critical", frag: "there has been a prolonged gap since the last checking", rec: "escalate", crit: 1 },
  { id: "CI.no_notebook", cat: "CI", label: "Notebook not produced", pol: "negative", impact: "critical", frag: "the student was unable to produce the notebook", rec: "escalate", crit: 1 },
];

export const OBS_BY_ID: Record<string, Observation> =
  Object.fromEntries(OBSERVATIONS.map((o) => [o.id, o]));

export const RECOMMENDATIONS: Record<string, { order: number; text: string }> = {
  escalate: { order: 1, text: "Escalate to the subject teacher and section head for immediate corrective action and a follow-up check." },
  work_completion: { order: 2, text: "Monitor completion of exercises and address incomplete or copied work directly with the student." },
  regular_checking: { order: 3, text: "Establish a fixed weekly notebook-checking schedule, with every check dated and signed." },
  document_gaps: { order: 4, text: "Ensure all classwork and homework is documented date-wise and have students complete missing entries." },
  index: { order: 5, text: "Maintain and regularly update the notebook index." },
  presentation: { order: 6, text: "Reinforce expectations for neatness, margins, and proper upkeep of the notebook." },
};

// ---------------------------------------------------------------------------
// LEGACY band vocabulary (Excellent...Critical). No longer produced, and no
// longer displayed either: splitStatus() re-derives every report's tag from
// its stored `days`, so a 13-day gap once filed as "Excellent" now reads
// "Delayed". That is deliberate. These tags feed a permanent personnel record,
// and leaving a wrong one standing against a teacher's name because it happens
// to be old would preserve the very error this change exists to correct. The
// underlying `days` is stored per notebook, so any figure stays auditable back
// to the raw date.
//
// Kept for colour lookup and for any stored tag that still needs rendering.
// Never delete this — it is load-bearing for historical data.
// ---------------------------------------------------------------------------
export const BAND_ORDER = ["Excellent", "Satisfactory", "Needs Improvement", "Major Concern", "Critical"] as const;
export type Band = (typeof BAND_ORDER)[number];

export const BAND_META: Record<Band, { color: string; tone: string }> = {
  Excellent: { color: "#2E9E9E", tone: "maintained to a high standard" },
  Satisfactory: { color: "#1C5A6B", tone: "maintained to a satisfactory standard" },
  "Needs Improvement": { color: "#E07B1A", tone: "in need of improvement" },
  "Major Concern": { color: "#C4581B", tone: "a matter of concern" },
  Critical: { color: "#A32020", tone: "in need of immediate corrective action" },
};

// ---------------------------------------------------------------------------
// NVS v2.0 — Notebook Verification Status Matrix.
// Day-based status, split by class band. v1.0 carried four override tags that
// took priority over the day count; two of them described the child's work, so
// they have been demoted to flags shown beside the tag. The rule now lives in
// engine.statusTag() and attribution.splitStatus(); the thresholds live here.
// ---------------------------------------------------------------------------
export type ClassBand = "primary" | "middle_senior";

export const CLASS_BAND_LABEL: Record<ClassBand, string> = {
  primary: "Nursery – V",
  middle_senior: "VI – X",
};

/**
 * The four tags a notebook can carry, best to worst.
 *
 * The worst tier is CRITICAL, not "Overdue". Both words were in use and they
 * said different things about the same fact: "Overdue" for a 40-day gap read
 * as an administrative slip, while "Critical" was reserved for a checkbox.
 * A notebook a fortnight past its checking schedule in Class III IS the
 * critical case, and the tag a principal skims should say so.
 */
export type DayStatus = "Up-to-date" | "Due Soon" | "Delayed" | "Critical";
/**
 * LEGACY. These three once overrode the day count. Two of them described the
 * CHILD's work, so a notebook checked yesterday could be reported as a failure
 * of the teacher — and, worse, a genuine 24-day lag could be hidden behind
 * "Index Missing". Tags are now generated from the teacher's checking alone
 * (see attribution.ts). Kept only so a stored tag from that era still renders.
 */
export type OverrideTag = "Superficial" | "Documentation Issue" | "Index Missing";
/** LEGACY. What the worst day-based tier was called before it became Critical. */
export type RetiredDayTag = "Overdue";
/** A missing last-checked date is unknown, not a failure. */
export type UnknownTag = "Not recorded";
export type StatusTag = OverrideTag | DayStatus | UnknownTag | RetiredDayTag;

const DAY_THRESHOLDS: Record<ClassBand, { upTo: number; dueSoon: number; delayed: number }> = {
  primary: { upTo: 3, dueSoon: 7, delayed: 14 },
  middle_senior: { upTo: 15, dueSoon: 30, delayed: 40 },
};

/**
 * Day-based standing.
 *
 * `days` is deliberately non-nullable. It used to accept null and answer
 * "Overdue", which quietly scored a blank date field against a teacher as if
 * she had never checked the book. Every caller must now decide for itself what
 * a missing date means; splitStatus() in attribution.ts calls it "Not recorded"
 * and keeps it out of her figures.
 */
export function dayStatus(days: number, classBand: ClassBand): DayStatus {
  const t = DAY_THRESHOLDS[classBand];
  if (days <= t.upTo) return "Up-to-date";
  if (days <= t.dueSoon) return "Due Soon";
  if (days <= t.delayed) return "Delayed";
  return "Critical";
}

/** True when the elapsed days alone put this notebook past its band's threshold. */
export function isBehind(days: number | null, classBand: ClassBand): boolean {
  if (days == null) return false;
  return days > DAY_THRESHOLDS[classBand].dueSoon;
}

export const STATUS_META: Record<StatusTag, { color: string; emoji: string; tone: string }> = {
  // The four current tags run 🟢 🟡 🟠 🔴 — one ramp, read at a glance.
  // Critical keeps the plain red dot rather than a siren: it is now the ordinary
  // name for the worst tier, not a rare alarm, and the tone must cover both ways
  // a notebook reaches it — a long gap, or no evidence of checking at all.
  "Up-to-date": { color: "#2E9E9E", emoji: "🟢", tone: "up to date" },
  "Due Soon": { color: "#D4AC0D", emoji: "🟡", tone: "due for checking soon" },
  Delayed: { color: "#E07B1A", emoji: "🟠", tone: "delayed in checking" },
  Critical: { color: "#A32020", emoji: "🔴", tone: "critically overdue for checking" },
  "Not recorded": { color: "#8A8F98", emoji: "⚪", tone: "without a recorded checking date" },
  // Legacy, for any stored tag that still needs rendering.
  Overdue: { color: "#A32020", emoji: "🔴", tone: "overdue for checking" },
  Superficial: { color: "#922B21", emoji: "❌", tone: "superficially checked, with cursory verification" },
  "Documentation Issue": { color: "#B9770E", emoji: "📋", tone: "affected by documentation lapses" },
  "Index Missing": { color: "#7D6608", emoji: "📑", tone: "missing a properly maintained index" },
};

// Combined severity order across BOTH vocabularies (old bands + new tags),
// least to most severe. A single report only ever uses one vocabulary
// internally, but this shared order lets "worst of" comparisons work
// safely regardless of which vintage of report is being read.
// "Not recorded" sits at the very bottom: it is an absence of evidence, not a
// degree of failure, and must never win a "worst of" comparison.
// "Overdue" is the retired name for what is now Critical, so it sits directly
// below it — a stored one must still outrank everything except Critical itself.
export const ALL_STATUS_ORDER: string[] = [
  "Not recorded",
  "Excellent", "Up-to-date",
  "Satisfactory", "Due Soon",
  "Needs Improvement", "Delayed", "Index Missing",
  "Major Concern", "Documentation Issue", "Superficial", "Overdue",
  "Critical",
];

export function worseTag(a: string, b: string): string {
  const ia = ALL_STATUS_ORDER.indexOf(a);
  const ib = ALL_STATUS_ORDER.indexOf(b);
  return ib > ia ? b : a;
}

// Universal color lookup: works for legacy bands AND new status tags,
// so old and new reports both render correctly without special-casing.
export function tagColor(tag: string): string {
  const statusMeta = (STATUS_META as Record<string, { color: string }>)[tag];
  if (statusMeta) return statusMeta.color;
  const bandMeta = (BAND_META as Record<string, { color: string }>)[tag];
  if (bandMeta) return bandMeta.color;
  return "#5b616e";
}

// Kept for any remaining callers; identical to tagColor.
export function bandColor(b: string): string {
  return tagColor(b);
}

// Reads the STORED tag regardless of report vintage: new reports store
// `statusTag`, old reports store `band`. Falls back to a safe default.
//
// Anything shown to a person should use splitStatus() in attribution.ts
// instead — a stored tag may be a pupil-side override that conceals the
// teacher's actual checking standing. This remains only for callers that
// genuinely need to know what was recorded at the time.
export function studentTag(s: { statusTag?: string; band?: string }): string {
  return s.statusTag || s.band || "Up-to-date";
}