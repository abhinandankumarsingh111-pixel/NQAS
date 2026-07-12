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
  crit?: 1 | 2;       // critical floor level
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
  { id: "CI.not_maintained", cat: "CI", label: "Notebook not maintained", pol: "negative", impact: "critical", frag: "the notebook is effectively not being maintained", rec: "escalate", crit: 2 },
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

export const BAND_ORDER = ["Excellent", "Satisfactory", "Needs Improvement", "Major Concern", "Critical"] as const;
export type Band = (typeof BAND_ORDER)[number];

export const BAND_META: Record<Band, { color: string; tone: string }> = {
  Excellent: { color: "#2E9E9E", tone: "maintained to a high standard" },
  Satisfactory: { color: "#1C5A6B", tone: "maintained to a satisfactory standard" },
  "Needs Improvement": { color: "#E07B1A", tone: "in need of improvement" },
  "Major Concern": { color: "#C4581B", tone: "a matter of concern" },
  Critical: { color: "#A32020", tone: "in need of immediate corrective action" },
};
