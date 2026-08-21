// ---------------------------------------------------------------------------
// OBSERVATION SCORING ENGINE
//
// Pure and deterministic. No React, no I/O. The sophistication lives here so
// the principal's screen can stay a list of short taps.
//
// THE GOVERNING RULE: what this file produces is a SUGGESTION. The principal's
// judgement overrides it, always, on every criterion, at any point before
// submission. Nothing here may ever be the last word — see `auto` vs `score`
// on CriterionAnswer, which are kept apart precisely so the report can show
// where a professional overruled the machine.
// ---------------------------------------------------------------------------

import {
  type Criterion, type Rubric, type RubricOption, rubricTotal,
} from "./observation-rubrics";

export interface CriterionAnswer {
  /** Option ids tapped. One for a scale, any number for a checklist. */
  selected: string[];
  /** The score that counts. Starts equal to `auto`; the principal may change it. */
  score: number;
  /** What the engine suggested. Never overwritten, so an edit stays visible. */
  auto: number;
  /** Optional. Never required to move on. */
  remark?: string;
}

export type Answers = Record<string, CriterionAnswer>;

// ---------------------------------------------------------------------------
// Checklist scoring starts from HALF MARKS, not zero.
//
// Each tick is a piece of evidence, not a fraction of a whole. A principal who
// ticks only "Well prepared" is saying preparation was good — from zero that
// would score 3/10, which reads as a failing and is plainly not what they
// meant. From half marks it scores 8/10, which is.
//
// A criterion with nothing ticked therefore sits at half marks: no evidence
// either way. That is honest, and the principal can edit it like any other.
// ---------------------------------------------------------------------------
function checklistBase(max: number): number {
  return Math.round(max / 2);
}

/**
 * The engine's suggested score for one criterion.
 *
 * Clamped to [0, max] — this is the "maximum score protection" the spec
 * requires. Ticking every positive on Classroom Management cannot yield 14/10
 * however generous the weights; it yields 10.
 */
export function suggestedScore(c: Criterion, selected: string[]): number {
  const picked = c.options.filter((o) => selected.includes(o.id));

  if (c.mode === "scale") {
    // Exactly one level applies. If somehow several are stored, the last tap
    // wins, which is what a radio-style control means.
    const last = picked[picked.length - 1];
    return last ? clamp(last.points, c.max) : checklistBase(c.max);
  }

  const raw = picked.reduce((n, o) => n + o.points, checklistBase(c.max));
  return clamp(raw, c.max);
}

function clamp(n: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(n)));
}

/** True when a score is a legal value for this criterion. */
export function isValidScore(c: Criterion, score: number): boolean {
  return Number.isFinite(score) && Number.isInteger(score) && score >= 0 && score <= c.max;
}

/** Build a fresh answer for a criterion from the taps, preserving any remark. */
export function answerFor(
  c: Criterion, selected: string[], previous?: CriterionAnswer,
): CriterionAnswer {
  const auto = suggestedScore(c, selected);
  // Re-tapping options resets the score to the new suggestion. Keeping a stale
  // hand-edited score against changed evidence would silently misreport.
  return { selected, auto, score: auto, remark: previous?.remark };
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------
export interface Totals {
  earned: number;
  max: number;
  pct: number;
  grade: string;
  /** Criteria the principal has not answered yet. */
  unanswered: string[];
  /** Criteria where the principal overrode the suggestion. */
  edited: string[];
}

export function totalsFor(r: Rubric, answers: Answers): Totals {
  const max = rubricTotal(r);
  let earned = 0;
  const unanswered: string[] = [];
  const edited: string[] = [];

  for (const c of r.criteria) {
    const a = answers[c.id];
    if (!a || a.selected.length === 0) { unanswered.push(c.id); continue; }
    earned += clamp(a.score, c.max);
    if (a.score !== a.auto) edited.push(c.id);
  }

  const pct = max ? Math.round((earned / max) * 1000) / 10 : 0;
  return { earned, max, pct, grade: gradeFor(pct), unanswered, edited };
}

/**
 * Grade bands, on PERCENTAGE rather than raw marks.
 *
 * Deliberate: the rubric weights are editable data, so the marks available can
 * change. A grade that means the same thing before and after a reweighting has
 * to be a proportion.
 */
export function gradeFor(pct: number): string {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "E";
}

export const GRADE_COLOR: Record<string, string> = {
  "A+": "#1E7A5A", A: "#2E9E9E", B: "#D4AC0D", C: "#E07B1A", D: "#C4581B", E: "#A32020",
};

// ---------------------------------------------------------------------------
// The written report, composed from taps.
//
// The principal should not have to type a report. Every option carries a
// `phrase`, and these assemble into two short paragraphs. The principal may
// edit the result, but should rarely need to.
// ---------------------------------------------------------------------------
const joinClauses = (a: string[]): string =>
  a.length === 0 ? "" : a.length === 1 ? a[0]
    : a.length === 2 ? `${a[0]} and ${a[1]}`
    : `${a.slice(0, -1).join(", ")}, and ${a[a.length - 1]}`;

const sentence = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) + "." : "");

function pickedOptions(r: Rubric, answers: Answers): { c: Criterion; o: RubricOption }[] {
  const out: { c: Criterion; o: RubricOption }[] = [];
  for (const c of r.criteria) {
    const a = answers[c.id];
    if (!a) continue;
    for (const o of c.options) if (a.selected.includes(o.id)) out.push({ c, o });
  }
  return out;
}

export interface Summary {
  strengths: string;
  improvements: string;
  /** Any remarks the principal chose to add, with their criterion name. */
  remarks: { criterion: string; text: string }[];
}

/**
 * Compose strengths and areas for improvement.
 *
 * Capped at six clauses each: past that a summary stops being read. The full
 * per-criterion detail is always on the report table beneath, so nothing is
 * lost by keeping the prose short.
 */
export function summarise(r: Rubric, answers: Answers): Summary {
  const picked = pickedOptions(r, answers);

  // Strengths report what was SEEN. Improvements report what to DO — a teacher
  // reading "the lesson was largely lecture-based" under "areas for
  // improvement" learns nothing they did not already know, so each concern
  // contributes its remedy instead. `fix` is optional; a concern without one
  // falls back to the observation rather than vanishing from the report.
  const pos = dedupe(picked.filter((p) => p.o.tone === "positive").map((p) => p.o.phrase));
  const neg = dedupe(picked.filter((p) => p.o.tone === "negative").map((p) => p.o.fix || p.o.phrase));

  return {
    strengths: pos.length ? sentence(joinClauses(pos.slice(0, MAX_CLAUSES))) : "",
    improvements: neg.length
      ? sentence(`${r.id === "demo" ? "the candidate" : "the teacher"} may focus on `
                 + joinClauses(neg.slice(0, MAX_CLAUSES)))
      : "",
    remarks: r.criteria
      .filter((c) => answers[c.id]?.remark?.trim())
      .map((c) => ({ criterion: c.name, text: answers[c.id]!.remark!.trim() })),
  };
}

/**
 * Past six clauses a summary stops being read, and every detail is on the
 * score table underneath anyway — so trimming here loses nothing.
 */
const MAX_CLAUSES = 6;

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

/** Per-criterion rows for the review screen and the report table. */
export function scoreRows(r: Rubric, answers: Answers) {
  return r.criteria.map((c) => {
    const a = answers[c.id];
    return {
      id: c.id,
      name: c.name,
      max: c.max,
      score: a ? clamp(a.score, c.max) : null,
      auto: a?.auto ?? null,
      edited: !!a && a.score !== a.auto,
      answered: !!a && a.selected.length > 0,
      chosen: a
        ? c.options.filter((o) => a.selected.includes(o.id)).map((o) => o.label)
        : [],
      remark: a?.remark?.trim() || "",
    };
  });
}
