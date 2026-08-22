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
  type Criterion, type Rubric, type RubricOption, rubricTotal, RETIRED,
} from "./observation-rubrics";

export interface CriterionAnswer {
  /** Option ids tapped. One for a scale, any number for a checklist. */
  selected: string[];
  /** The score that counts. Starts equal to `auto`; the principal may change it. */
  score: number;
  /** What the engine suggested. Never overwritten, so an edit stays visible. */
  auto: number;
  /**
   * The marks this criterion was worth WHEN IT WAS SCORED.
   *
   * Rubric weights are editable data, so they will be retuned. Without this,
   * every record already filed would silently re-read itself against the new
   * weights — a 12/15 scored last term would render as 12/10 once the criterion
   * dropped to 10, or worse be clamped to 10/10 and quietly lose the mark. A
   * personnel record has to keep meaning what it meant on the day.
   *
   * Optional only because records written before this field exists have none;
   * those fall back to the current rubric, and the report says so.
   */
  max?: number;
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
  return { selected, auto, score: auto, max: c.max, remark: previous?.remark };
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
    earned += clamp(a.score, a.max ?? c.max);
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

  // Strengths report what was SEEN.
  const pos = dedupe(picked.filter((p) => p.o.tone === "positive").map((p) => p.o.phrase));
  // In-Campus concerns contribute their REMEDY, because a teacher reading "the
  // lesson was largely lecture-based" learns nothing they did not know. An
  // `action` is optional, so a concern without one falls back to the
  // observation rather than vanishing from the report.
  //
  // Demo concerns contribute what was OBSERVED instead. A demo `action` is
  // written for the panel ("ask two questions from the senior syllabus at
  // interview"), so folding it in here produced the nonsense sentence "the
  // candidate may focus on ask two questions from the senior syllabus". The
  // panel's actions belong in the plan, which is where they now go.
  const neg = dedupe(picked.filter((p) => p.o.tone === "negative")
    .map((p) => (r.id === "demo" ? p.o.phrase : (p.o.action || p.o.phrase))));

  return {
    strengths: pos.length ? sentence(joinClauses(pos.slice(0, MAX_CLAUSES))) : "",
    improvements: neg.length
      ? sentence(r.id === "demo"
          ? `the panel should note that ${joinClauses(neg.slice(0, MAX_CLAUSES))}`
          : `the teacher may focus on ${joinClauses(neg.slice(0, MAX_CLAUSES))}`)
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

/**
 * Per-criterion rows for the review screen and the report table.
 *
 * Rows for RETIRED criteria are appended after the live ones whenever the
 * record actually carries an answer for them. Without this, dropping a
 * criterion from the rubric would silently delete rows from every record ever
 * scored against it — the total would still say 95 while the table underneath
 * added up to 85, and nobody reading it a year later would know why.
 */
export function scoreRows(r: Rubric, answers: Answers): ScoreRow[] {
  const row = (c: Criterion, retired: boolean): ScoreRow => {
    const a = answers[c.id];
    // The criterion's worth AS SCORED, so an old report keeps reading correctly
    // after the rubric is retuned.
    const max = a?.max ?? c.max;
    return {
      id: c.id,
      name: c.name,
      max,
      score: a ? clamp(a.score, max) : null,
      auto: a?.auto ?? null,
      edited: !!a && a.score !== a.auto,
      answered: !!a && a.selected.length > 0,
      chosen: a
        ? c.options.filter((o) => a.selected.includes(o.id)).map((o) => o.label)
        : [],
      remark: a?.remark?.trim() || "",
      retired,
    };
  };

  const live = r.criteria.map((c) => row(c, false));
  const known = new Set(r.criteria.map((c) => c.id));
  const gone = (RETIRED[r.id] || [])
    .filter((c) => !known.has(c.id) && !!answers[c.id])
    .map((c) => row(c, true));
  return [...live, ...gone];
}

export interface ScoreRow {
  id: string;
  name: string;
  max: number;
  score: number | null;
  auto: number | null;
  edited: boolean;
  answered: boolean;
  chosen: string[];
  remark: string;
  /** Scored under an earlier version of this rubric; no longer asked. */
  retired: boolean;
}

// ---------------------------------------------------------------------------
// THE DEVELOPMENT PLAN
//
// The difference between a report a teacher acts on and one they file away.
//
// Ordering is by MARKS LOST, not by the order the criteria happen to appear in.
// A teacher who reads four suggestions will act on the first one, so the first
// one has to be the one that matters most. Ordering by criterion number would
// put "Preparation" above "Subject Knowledge" purely because it is asked first.
//
// Capped, deliberately. Handing someone eleven things to fix is the same as
// handing them none; three or four is a term's work.
// ---------------------------------------------------------------------------
export interface PlanAction {
  criterionId: string;
  /** Which criterion this came from, for the teacher to place it. */
  criterion: string;
  /** Marks lost there — the reason this is ranked where it is. */
  lost: number;
  max: number;
  /** The concrete thing to do next lesson. */
  action: string;
  /** What was observed that prompted it, so the advice is not a mystery. */
  observed: string[];
}

export function developmentPlan(r: Rubric, answers: Answers, limit = 4): PlanAction[] {
  const found: PlanAction[] = [];

  for (const c of r.criteria) {
    const a = answers[c.id];
    if (!a) continue;
    const max = a.max ?? c.max;
    const lost = Math.max(0, max - clamp(a.score, max));

    for (const o of c.options) {
      if (!a.selected.includes(o.id) || o.tone !== "negative" || !o.action) continue;
      const already = found.find((f) => f.action === o.action);
      // The same remedy can be prompted by two observations; say both rather
      // than printing the same instruction twice.
      if (already) { already.observed.push(o.label); continue; }
      found.push({
        criterionId: c.id, criterion: c.name, lost, max,
        action: o.action, observed: [o.label],
      });
    }
  }

  return found.sort((x, y) => y.lost - x.lost || y.max - x.max).slice(0, limit);
}

/**
 * What the teacher should KEEP doing.
 *
 * A report that lists only faults gets read once and resented. Naming what
 * worked is not softening the message; it tells the teacher which of their
 * habits to protect while they change the others.
 */
export function strengthsList(r: Rubric, answers: Answers, limit = 5): string[] {
  const out: { label: string; weight: number }[] = [];
  for (const c of r.criteria) {
    const a = answers[c.id];
    if (!a) continue;
    for (const o of c.options) {
      if (!a.selected.includes(o.id) || o.tone !== "positive") continue;
      out.push({ label: o.label, weight: o.points });
    }
  }
  return out.sort((x, y) => y.weight - x.weight).slice(0, limit).map((x) => x.label);
}

/**
 * Criteria where anything negative was recorded.
 *
 * Used to spot a concern raised again at the next observation. A weakness
 * flagged three times running is a different conversation from one flagged
 * once, and the system should be the thing that remembers, not the principal.
 */
export function concernCriteria(r: Rubric, answers: Answers): string[] {
  return r.criteria
    .filter((c) => {
      const a = answers[c.id];
      return !!a && c.options.some((o) => a.selected.includes(o.id) && o.tone === "negative");
    })
    .map((c) => c.id);
}

/** Name a criterion from its id, for rendering a repeat-concern notice. */
export function criterionName(r: Rubric, id: string): string {
  return r.criteria.find((c) => c.id === id)?.name || id;
}

// ---------------------------------------------------------------------------
// COMPOSING THE PLAN
//
// `developmentPlan` above derives a plan from the taps. That is a good draft
// and a poor final word: it can only ever suggest the remedies attached to the
// concerns the principal happened to tick, and it hands them a fixed list of
// four with no say in it.
//
// The principal was in the room. They know that this teacher has been told
// about wait time twice already, that the real problem is the seating, that the
// factual slip was a one-off. So the machine's job here is to lay out a shelf —
// the remedies for what was actually seen, PLUS the wider pool for every
// criterion that lost marks — and let the principal pick from it, drop what
// does not apply, reorder it, and add whatever they would have written by hand.
//
// What gets filed is what they composed, not what the arithmetic proposed.
// ---------------------------------------------------------------------------

export interface PlanSuggestion {
  criterionId: string;
  criterion: string;
  /** The action itself. Unique across the returned list. */
  action: string;
  /** Marks lost on that criterion — why this is ranked where it is. */
  lost: number;
  max: number;
  /** Labels of what was seen that prompted it. Empty for pool suggestions. */
  observed: string[];
  /**
   * observed  — the remedy attached to a concern the principal actually ticked.
   * suggested — from the criterion's wider pool, offered because it lost marks.
   */
  source: "observed" | "suggested";
}

/**
 * Everything worth offering, best first.
 *
 * Ranked by MARKS LOST rather than by criterion order, because a principal
 * scanning a list takes the top of it. A pool suggestion against a criterion
 * that lost eight marks matters more than an observed one against a criterion
 * that lost two, so marks lost wins the sort and the source only breaks ties.
 */
export function planSuggestions(r: Rubric, answers: Answers): PlanSuggestion[] {
  const found: PlanSuggestion[] = [];
  const seen = new Map<string, PlanSuggestion>();

  const add = (s: PlanSuggestion) => {
    const already = seen.get(s.action);
    if (already) {
      // The same remedy can be prompted twice — by a ticked concern and again
      // by the pool, or by two different criteria. Say it once, and keep the
      // stronger provenance.
      for (const o of s.observed) if (!already.observed.includes(o)) already.observed.push(o);
      if (s.source === "observed") already.source = "observed";
      if (s.lost > already.lost) already.lost = s.lost;
      return;
    }
    seen.set(s.action, s);
    found.push(s);
  };

  for (const c of r.criteria) {
    const a = answers[c.id];
    if (!a) continue;
    const max = a.max ?? c.max;
    const lost = Math.max(0, max - clamp(a.score, max));

    for (const o of c.options) {
      if (!a.selected.includes(o.id) || o.tone !== "negative" || !o.action) continue;
      add({
        criterionId: c.id, criterion: c.name, action: o.action,
        lost, max, observed: [o.label], source: "observed",
      });
    }

    // The wider pool, offered only where there is something to gain. A
    // criterion at full marks needs no advice attached to it.
    if (lost > 0) {
      for (const g of c.growth) {
        add({
          criterionId: c.id, criterion: c.name, action: g,
          lost, max, observed: [], source: "suggested",
        });
      }
    }
  }

  const rank = (s: PlanSuggestion) => (s.source === "observed" ? 0 : 1);
  return found.sort((x, y) => y.lost - x.lost || rank(x) - rank(y) || y.max - x.max);
}

/**
 * One line of the filed plan.
 *
 * `source` is kept so the report can say where each line came from. A line the
 * principal wrote themselves carries more weight with the teacher than one the
 * system proposed, and hiding the difference would be a small dishonesty.
 */
export interface PlanItem {
  text: string;
  /** Which criterion it answers. Absent on a line the principal wrote. */
  criterion?: string;
  source: "observed" | "suggested" | "written";
}

export type Plan = PlanItem[];

/**
 * Caps. A plan of twelve items is not a plan, it is a complaint — and the
 * teacher will act on none of it. Eight is already generous; four is a term's
 * work, which is why that is what gets pre-ticked.
 */
export const PLAN_MAX_ITEMS = 8;
export const PLAN_MAX_LEN = 300;

/**
 * What the plan starts as before the principal touches it.
 *
 * Only the remedies for what was ACTUALLY OBSERVED are pre-ticked. Pool
 * suggestions are offered but never pre-selected: putting words in the
 * principal's mouth about something they did not tick would be the system
 * making the judgement, which is precisely what it must not do.
 */
export function defaultPlan(r: Rubric, answers: Answers, limit = 4): Plan {
  return planSuggestions(r, answers)
    .filter((s) => s.source === "observed")
    .slice(0, limit)
    .map((s) => ({ text: s.action, criterion: s.criterion, source: "observed" as const }));
}

/**
 * Accept a plan from anywhere — the browser, an older record, a hand edit —
 * and return something safe to file.
 *
 * Used on the server on every save, because the browser is not trusted, and on
 * the report, because a record written before this column existed has none.
 */
export function normalisePlan(raw: unknown): Plan {
  if (!Array.isArray(raw)) return [];
  const out: Plan = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (out.length >= PLAN_MAX_ITEMS) break;
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.trim().replace(/\s+/g, " ").slice(0, PLAN_MAX_LEN) : "";
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const raw_source = typeof o.source === "string" ? o.source : "";
    const source: PlanItem["source"] =
      raw_source === "observed" || raw_source === "suggested" ? raw_source : "written";
    const criterion = typeof o.criterion === "string" && o.criterion.trim()
      ? o.criterion.trim().slice(0, 80) : undefined;
    out.push({ text, source, ...(criterion ? { criterion } : {}) });
  }
  return out;
}

/** Plain-text form, one action per line — how an amendment edits it. */
export function planToText(plan: Plan): string {
  return plan.map((p) => p.text).join("\n");
}

/** The reverse. Lines a principal typed are their own, so they file as `written`. */
export function planFromText(text: string): Plan {
  return normalisePlan(
    text.split("\n").map((l) => l.trim()).filter(Boolean)
      .map((t) => ({ text: t, source: "written" })),
  );
}
