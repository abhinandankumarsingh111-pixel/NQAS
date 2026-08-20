// The NQAS engine. Pure, deterministic, framework-free. No React, no I/O.
// This is the component the whole product is built around.

import {
  OBS_BY_ID, RECOMMENDATIONS, CATEGORIES,
  type ClassBand, type StatusTag, dayStatus, isBehind, STATUS_META, worseTag,
} from "./observations";

export interface StudentInput {
  name: string;
  lastChecked: string;   // yyyy-mm-dd or ""
  selected: string[];    // observation ids
  customs: string[];
}
export interface StudentResult {
  name: string;
  days: number | null;
  statusTag: StatusTag;
  remark: string;
  // Persisted so the teacher record can aggregate on observation ids rather
  // than string-matching the composed prose, and so `days` stays independently
  // re-derivable from the raw date when a figure is challenged.
  obs?: string[];
  lastChecked?: string | null;
}
export interface Academic { teacher: string; cls: string; subject: string; classBand: ClassBand }
export interface ReportMeta { campus: string; coordinatorName: string; date: string }
export interface Report {
  meta: ReportMeta;
  academic: Academic;
  students: StudentResult[];
  recs: string[];
  finalObservation: string;
  principalSummary: string;
  engine: "ai" | "deterministic";
}

export function daysSince(last: string, ref: string): number | null {
  if (!last || !ref) return null;
  const a = new Date(last), b = new Date(ref);
  if (isNaN(+a) || isNaN(+b)) return null;
  return Math.max(0, Math.round((+b - +a) / 86_400_000));
}

// ---------------------------------------------------------------------------
// NVS v2.0 status rule. A tag reports the TEACHER'S CHECKING and nothing else.
//
//   1. Critical      — no evidence of teacher checking at all. The one genuine
//                      failure severe enough to override the day count.
//   2. Not recorded  — no last-checked date. Unknown, not a failure; excluded
//                      from her figures rather than scored against her.
//   3. Otherwise     — the day-based status for the class band.
//
// v1.0 let any critical-impact observation and any negative Documentation or
// Index observation override the day count. Two of those describe the CHILD's
// work, which broke the tag in both directions: a notebook checked yesterday
// with an untidy book read "Critical", while a genuine 24-day lag hid behind
// "Index Missing". Child-side observations are now flags beside the tag —
// recorded in full, never able to set it. See attribution.ts.
// ---------------------------------------------------------------------------
export function statusTag(ids: string[], days: number | null, classBand: ClassBand): StatusTag {
  if (ids.includes("CI.no_teacher_check")) return "Critical";
  if (days == null) return "Not recorded";
  return dayStatus(days, classBand);
}

/**
 * Contradictions worth catching before a report is filed.
 *
 * `days` and `classBand` are optional so existing callers keep working; pass
 * them to also catch ticks that contradict the recorded date. Both cases below
 * exist in live data — "prolonged gap" was ticked on notebooks checked the
 * same day — and each one distorts a teacher's permanent record.
 */
export function checkConsistency(ids: string[], days?: number | null, classBand?: ClassBand): string[] {
  const set = new Set(ids), out: string[] = [], seen = new Set<string>();
  ids.forEach((id) => (OBS_BY_ID[id]?.excludes || []).forEach((ex) => {
    if (set.has(ex)) {
      const k = [id, ex].sort().join("|");
      if (!seen.has(k)) { seen.add(k); out.push(`"${OBS_BY_ID[id].label}" conflicts with "${OBS_BY_ID[ex].label}" — please review.`); }
    }
  }));

  if (days != null && classBand) {
    const recent = !isBehind(days, classBand);
    if (recent && set.has("CI.long_gap")) {
      out.push(`"Prolonged gap" is ticked, but this notebook was checked ${days} day${days === 1 ? "" : "s"} ago — please review.`);
    }
    if (recent && set.has("CI.no_teacher_check")) {
      out.push(`"No teacher checking at all" is ticked, but a checking date ${days} day${days === 1 ? "" : "s"} ago was entered — please review.`);
    }
    if (recent && set.has("CQ.not_this_cycle")) {
      out.push(`"Not checked this cycle" is ticked, but the last check was ${days} day${days === 1 ? "" : "s"} ago — please review.`);
    }
  }
  return out;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const joinC = (a: string[]) =>
  a.length === 0 ? "" : a.length === 1 ? a[0] : a.length === 2 ? `${a[0]} and ${a[1]}`
    : `${a.slice(0, -1).join(", ")}, and ${a[a.length - 1]}`;

function fragmentsFor(ids: string[]) {
  const used = new Set<string>(), pos: string[] = [], neg: string[] = [];
  ids.map((i) => OBS_BY_ID[i]).filter(Boolean).forEach((o) => {
    if (used.has(o.id)) return;
    used.add(o.id); (o.mergesWith || []).forEach((m) => used.add(m));
    (o.pol === "negative" ? neg : pos).push(o.frag);
  });
  return { pos, neg };
}

export function remarkTrack1(s: StudentInput, idx: number): string {
  const { pos, neg } = fragmentsFor(s.selected);
  const contrast = ["though", "however,", "while"][idx % 3];
  let b: string;
  if (pos.length && neg.length) b = `${cap(joinC(pos))}, ${contrast} ${joinC(neg)}.`;
  else if (pos.length) b = `${cap(joinC(pos))}.`;
  else if (neg.length) b = `${cap(joinC(neg))}.`;
  else b = "No observations were recorded for this notebook.";
  const cus = (s.customs || []).filter(Boolean).map((c) => c.trim().replace(/\.?$/, "."));
  if (cus.length) b += " " + cus.join(" ");
  return b;
}

function topCats(results: StudentResult[], inputs: StudentInput[]): string[] {
  const c: Record<string, number> = {};
  inputs.forEach((s) => s.selected.forEach((id) => {
    const o = OBS_BY_ID[id]; if (o?.pol === "negative") c[o.cat] = (c[o.cat] || 0) + 1;
  }));
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([id]) => CATEGORIES.find((x) => x.id === id)!.name.toLowerCase());
}

const GOOD_TAGS = new Set<StatusTag>(["Up-to-date", "Due Soon"]);
// A missing checking date is unknown, not a lapse. It must not be counted as a
// concern in the narrative, or a notebook whose date was simply left blank
// would read as a failure of the teacher.
const UNKNOWN_TAGS = new Set<StatusTag>(["Not recorded"]);

function finalTrack1(results: StudentResult[], inputs: StudentInput[], academic: Academic): string {
  const n = results.length;
  const unknown = results.filter((s) => UNKNOWN_TAGS.has(s.statusTag)).length;
  const good = results.filter((s) => GOOD_TAGS.has(s.statusTag)).length;
  const concern = n - good - unknown;
  const assessed = n - unknown;
  const unknownNote = unknown
    ? ` ${unknown} notebook${unknown === 1 ? " has no recorded checking date and is" : "s have no recorded checking date and are"} excluded from this count.`
    : "";
  const anyCritical = results.some((s) => s.statusTag === "Critical");
  const cats = topCats(results, inputs);
  // A notebook can land in "concern" purely on elapsed days (Delayed/Overdue) with an
  // otherwise clean, all-positive checklist — topCats only sees negative-tag categories,
  // so it can come back empty even though concern > 0. Fall back to naming the day-based
  // lapse itself rather than leaving "chiefly on ___" blank.
  const tail = anyCritical
    ? "One or more notebooks show critical lapses — with no evidence of checking in the current session — that call for immediate corrective action."
    : !concern ? "Standards are being maintained and should be sustained."
    : cats.length ? `The concerns centre chiefly on ${joinC(cats)} and should be addressed in the coming cycle.`
    : concern > 1
      ? "The concerns centre chiefly on checking having fallen behind schedule and should be addressed in the coming cycle."
      : "The concern centres chiefly on checking having fallen behind schedule and should be addressed in the coming cycle.";
  return `Across the ${n} notebook${n > 1 ? "s" : ""} sampled for ${academic.teacher || "the teacher"}'s ${academic.subject || "subject"} (${academic.cls || "class"}), ${good} of ${assessed} ${good === 1 ? "is" : "are"} up to date or due soon, while ${concern} require${concern === 1 ? "s" : ""} attention.${unknownNote} ${tail}`;
}

function summaryTrack1(results: StudentResult[], academic: Academic, meta: ReportMeta, recs: string[]): string {
  const n = results.length;
  const unknown = results.filter((s) => UNKNOWN_TAGS.has(s.statusTag)).length;
  const good = results.filter((s) => GOOD_TAGS.has(s.statusTag)).length;
  const concern = n - good - unknown;
  const assessed = n - unknown;
  const worst = results.reduce<string>((w, s) => worseTag(w, s.statusTag), "Up-to-date");
  const worstTone = (STATUS_META as Record<string, { tone: string }>)[worst]?.tone || "in need of review";
  const action = recs.length ? recs[0] : "No corrective action is required at this stage.";
  // "Overall" must describe the whole batch, not just its single worst notebook — a lone
  // Delayed notebook among four Up-to-date ones should not be reported as "Overall the
  // notebooks are delayed in checking." Only use the worst tone for the whole batch when
  // the whole batch actually shares it (concern === n, which also covers the n === 1
  // single-notebook case); otherwise state the proportion explicitly.
  const overall = !concern
    ? "Overall the notebooks are up to date."
    : concern === assessed
      ? `Overall the notebooks are ${worstTone}.`
      : concern === 1
        ? `Overall, ${good} of ${assessed} ${good === 1 ? "is" : "are"} up to date, though 1 is ${worstTone}.`
        : `Overall, ${good} of ${assessed} ${good === 1 ? "is" : "are"} up to date, though ${concern} require attention (most seriously, ${worstTone}).`;
  return `Notebook verification of ${academic.subject || "subject"} (${academic.cls || "class"}) under ${academic.teacher || "the teacher"} was carried out on ${meta.date} across ${n} sample${n > 1 ? "s" : ""}. ${overall} ${action}`;
}

export function consolidateRecs(allIds: string[]): string[] {
  const ids = new Set<string>();
  allIds.forEach((id) => { const r = OBS_BY_ID[id]?.rec; if (r) ids.add(r); });
  return [...ids].map((r) => RECOMMENDATIONS[r]).sort((a, b) => a.order - b.order).map((r) => r.text);
}

// Deterministic report (Track 1 only). AI paragraphs, if any, are layered on by the caller.
export function buildDeterministic(meta: ReportMeta, academic: Academic, students: StudentInput[]): Report {
  const results: StudentResult[] = students.map((s, idx) => {
    const d = daysSince(s.lastChecked, meta.date);
    const tag = statusTag(s.selected, d, academic.classBand);
    return {
      name: s.name, days: d, statusTag: tag, remark: remarkTrack1(s, idx),
      obs: s.selected, lastChecked: s.lastChecked || null,
    };
  });
  let recs = consolidateRecs(students.flatMap((s) => s.selected));
  // Recommendations are derived purely from selected observation ids, same blind spot as
  // topCats above. A notebook can be Delayed/Overdue/Critical on elapsed days alone, with
  // no negative observation selected, so recs can come back empty even though a concern
  // exists — leaving the principal's summary to say "No corrective action is required"
  // right next to a Delayed/Overdue status. Fall back to the standard checking-schedule
  // recommendation whenever any student has a non-good status but no rec was derived.
  if (!recs.length && results.some((s) => !GOOD_TAGS.has(s.statusTag) && !UNKNOWN_TAGS.has(s.statusTag))) {
    recs = [RECOMMENDATIONS.regular_checking.text];
  }
  return {
    meta, academic, students: results, recs,
    finalObservation: finalTrack1(results, students, academic),
    principalSummary: summaryTrack1(results, academic, meta, recs),
    engine: "deterministic",
  };
}

// Payload builder for the AI (Track 2). Kept here so the API route stays thin.
export function aiPayload(meta: ReportMeta, academic: Academic, students: StudentInput[]) {
  return {
    campus: meta.campus, teacher: academic.teacher, class: academic.cls, subject: academic.subject,
    classBand: academic.classBand, date: meta.date, sampleSize: students.length,
    students: students.map((s) => {
      const d = daysSince(s.lastChecked, meta.date);
      const tag = statusTag(s.selected, d, academic.classBand);
      return {
        name: s.name, daysSinceChecked: d, status: tag,
        strengths: s.selected.map((i) => OBS_BY_ID[i]).filter((o) => o?.pol === "positive").map((o) => o.label),
        concerns: s.selected.map((i) => OBS_BY_ID[i]).filter((o) => o?.pol === "negative").map((o) => o.label),
        custom: (s.customs || []).filter(Boolean),
      };
    }),
    consolidatedRecommendations: consolidateRecs(students.flatMap((s) => s.selected)),
  };
}