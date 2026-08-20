import { dayStatus, isBehind, worseTag, type ClassBand, type DayStatus } from "./observations";

// ---------------------------------------------------------------------------
// ATTRIBUTION POLICY — what a teacher may be held to.
//
// Kept in its own file, named for exactly the question it answers, so that
// anyone auditing "what can this teacher be blamed for?" finds one short file
// rather than a constant buried in the observation library.
//
// The teacher accountability record must only ever count what the teacher
// actually controls. Copy correction is her job; a child's untidy handwriting
// is not. Counting SW/NP/IDX against her would penalise her for her intake,
// which is unfair and — in a record that may inform an employment decision —
// indefensible.
//
// RULE: ambiguous attribution resolves in the TEACHER'S FAVOUR. Anything not
// listed here is shown as context on the report and excluded from her figures.
// `CI.not_maintained` (could be either) and `CI.no_notebook` (the student could
// not produce it) are deliberately absent.
//
// Editing this set changes what a teacher can be held to. Treat it as policy,
// not as configuration.
// ---------------------------------------------------------------------------
export const TEACHER_ATTRIBUTABLE_OBS: ReadonlySet<string> = new Set([
  "CQ.irregular",        // checking has been irregular over the assessed period
  "CQ.not_this_cycle",   // no evidence of checking in the current cycle
  "CQ.superficial",      // checking cursory, errors left unmarked
  "CI.no_teacher_check", // no evidence of teacher checking at all
  "CI.long_gap",         // prolonged gap since the last checking
]);

/** True when this observation reflects the teacher's own copy correction. */
export function isTeacherFault(obsId: string): boolean {
  return TEACHER_ATTRIBUTABLE_OBS.has(obsId);
}

/** The subset of these observations that count toward a teacher's record. */
export function teacherFaults(obsIds: string[]): string[] {
  return obsIds.filter(isTeacherFault);
}

// ===========================================================================
// THE TAG RULE
//
// A notebook's status tag reports ONE thing: the teacher's checking standing.
// Its spine is days-since-checked against the class band. Nothing the child
// did may set it.
//
// The old rule let four overrides replace the day count, two of which
// described the child's work. It failed in both directions, and the second is
// the dangerous one:
//
//   FALSE ALARM   1 day since checked, every teacher signal positive, but the
//                 child's book was untidy -> reported "Critical".
//   MISSED ALARM  24 days since checked — a serious lag — but the child had no
//                 index -> reported "Index Missing", and the lag vanished.
//
// A system built to surface checking lags was concealing them. Hence: the tag
// comes from her checking; everything else is a flag beside it.
// ===========================================================================

/** The tag vocabulary. Day-based, plus one unknown. */
export type TeacherTag = DayStatus | "Not recorded";

/**
 * The teacher's own checking faults. These are shown beside the tag and DO
 * count toward her record — but they describe quality and history, not current
 * timeliness, so they do not replace the day-based tag. A notebook can honestly
 * read "Up-to-date · Superficial checking".
 */
export const TEACHER_FLAG_LABEL: Readonly<Record<string, string>> = {
  "CQ.irregular": "Irregular checking",
  "CQ.not_this_cycle": "Not checked this cycle",
  "CQ.superficial": "Superficial checking",
  "CI.long_gap": "Prolonged gap",
};

/**
 * The child's own shortcomings. Recorded and displayed so nothing is lost, but
 * never counted against the teacher and never able to set the tag.
 *
 * `CI.not_maintained` sits here deliberately. It is the tick that was turning
 * same-day checks into "Critical", and coordinators plainly use it to mean the
 * child's book is a mess — it appears alongside CQ.dated, a POSITIVE teacher
 * observation. See the relabelling in observations.ts.
 */
export const PUPIL_FLAG_LABEL: Readonly<Record<string, string>> = {
  "DOC.gaps": "Gaps in work",
  "DOC.missing_hw": "Homework missing",
  "DOC.undated": "Entries undated",
  "IDX.partial": "Index incomplete",
  "IDX.absent": "No index",
  "SW.untidy": "Untidy work",
  "SW.incomplete": "Work incomplete",
  "SW.copied": "Work appears copied",
  "NP.worn": "Notebook poorly kept",
  "NP.no_margins": "No margins or headings",
  "CI.not_maintained": "Notebook not maintained",
  "CI.no_notebook": "Notebook not produced",
};

/** LEGACY tags that described the child, not the teacher. */
export const STUDENT_ATTRIBUTABLE_TAGS: ReadonlySet<string> = new Set([
  "Documentation Issue",
  "Index Missing",
]);

export function isStudentSideTag(tag: string): boolean {
  return STUDENT_ATTRIBUTABLE_TAGS.has(tag);
}

// ===========================================================================
// WHEN A TICK AND THE DATE DISAGREE
//
// Three teacher-side ticks assert that TIME HAS PASSED. Each is a claim the
// recorded date can flatly contradict, and both contradictions exist in live
// data: "Prolonged gap" on a notebook checked the SAME DAY, and "Not checked
// this cycle" on one checked two days earlier.
//
// One of the two entries is a mistake, and there is no way to tell which from
// here. Counting it would put a lapse on a permanent record on the strength of
// a tick the coordinator's own date refutes. Dropping it silently would destroy
// an observation someone made in the room.
//
// So a contradicted tick is DISPUTED: shown on the report, excluded from her
// figures, left for a person to resolve. Ambiguity resolves in her favour, as
// everywhere else in this file.
//
// CQ.irregular and CQ.superficial are absent deliberately — neither is
// contradicted by a recent date. A notebook can honestly be checked yesterday
// and checked badly.
// ===========================================================================
export const DATE_CONTRADICTABLE: ReadonlySet<string> = new Set([
  "CI.long_gap",          // "prolonged gap" — but it was checked on Tuesday
  "CQ.not_this_cycle",    // "not this cycle" — but the last check was 2 days ago
  "CI.no_teacher_check",  // "never checked"  — but a checking date was entered
]);

/** Label for CI.no_teacher_check when it is disputed and so cannot set the tag. */
const NO_CHECK_LABEL = "No teacher checking recorded";

/** True when the recorded date refutes a tick asserting that time has passed. */
function dateRefutes(days: number | null | undefined, classBand?: ClassBand | null): boolean {
  if (!classBand || days == null) return false;  // no date, nothing to refute with
  return !isBehind(days, classBand);
}

/**
 * The teacher-attributable ticks that survive the recorded date — the ones she
 * may fairly be held to. Use this, not teacherFaults(), wherever a figure is
 * computed. teacherFaults() answers "what is hers in principle"; this answers
 * "what is hers on this notebook, given what the date says".
 */
export function countableFaults(
  obsIds: string[], days: number | null, classBand?: ClassBand | null,
): string[] {
  const faults = (obsIds || []).filter(isTeacherFault);
  if (!dateRefutes(days, classBand)) return faults;
  return faults.filter((o) => !DATE_CONTRADICTABLE.has(o));
}

/** The teacher-attributable ticks this notebook's date refutes. */
export function disputedFaults(
  obsIds: string[], days: number | null, classBand?: ClassBand | null,
): string[] {
  if (!dateRefutes(days, classBand)) return [];
  return (obsIds || []).filter((o) => isTeacherFault(o) && DATE_CONTRADICTABLE.has(o));
}

export interface SplitStatus {
  /** The tag: her checking standing, and nothing else. */
  tag: string;
  /** Her own checking faults, minus any the date refutes. Counted. */
  teacherFlags: string[];
  /** The child's shortcomings. Shown, never counted. */
  pupilFlags: string[];
  /** Her ticks that the recorded date contradicts. Shown, never counted. */
  disputedFlags: string[];
  /** True when no last-checked date was recorded, so timeliness is unknown. */
  unknown: boolean;
}

/**
 * Split a stored student row into the teacher's tag and the two kinds of flag.
 *
 * Works for every report vintage. Where observation ids were recorded the flags
 * are exact; where they were not (reports predating observation capture) the
 * tag is still recovered from elapsed days, which is what matters most.
 * Without a class band the thresholds are unknown, so the stored tag is left
 * alone rather than guessed at.
 */
export function splitStatus(
  s: { statusTag?: string; band?: string; days?: number | null; obs?: string[] | null },
  classBand?: ClassBand | null,
): SplitStatus {
  const obs = s.obs || [];
  const refuted = dateRefutes(s.days, classBand);
  const label = (o: string) => (o === "CI.no_teacher_check" ? NO_CHECK_LABEL : TEACHER_FLAG_LABEL[o]);

  const teacherFlags = obs
    .filter((o) => o in TEACHER_FLAG_LABEL && !(refuted && DATE_CONTRADICTABLE.has(o)))
    .map((o) => TEACHER_FLAG_LABEL[o]);
  const disputedFlags = refuted
    ? obs.filter((o) => isTeacherFault(o) && DATE_CONTRADICTABLE.has(o)).map(label)
    : [];
  const pupilFlags = obs.filter((o) => o in PUPIL_FLAG_LABEL).map((o) => PUPIL_FLAG_LABEL[o]);

  // No band: thresholds unknown. Fall back to what was recorded, and recover
  // the pupil-side legacy overrides at least as flags.
  const stored = s.statusTag || s.band || "Up-to-date";
  if (!classBand) {
    const legacy = isStudentSideTag(stored) ? [stored] : [];
    return {
      tag: stored, teacherFlags, disputedFlags,
      pupilFlags: [...new Set([...pupilFlags, ...legacy])], unknown: false,
    };
  }

  // No evidence of any checking is the one genuine teacher failure severe
  // enough to override the day count — unless the coordinator also entered a
  // recent checking date, in which case the tick is disputed and cannot brand
  // her Critical on evidence her own report contradicts.
  if (obs.includes("CI.no_teacher_check") && !refuted) {
    return { tag: "Critical", teacherFlags, pupilFlags, disputedFlags, unknown: false };
  }
  // A missing date is an absence of evidence, not a failure. It must not be
  // scored against her, so it is named plainly and excluded from her figures.
  if (s.days == null) {
    return { tag: "Not recorded", teacherFlags, pupilFlags, disputedFlags, unknown: true };
  }
  return { tag: dayStatus(s.days, classBand), teacherFlags, pupilFlags, disputedFlags, unknown: false };
}

/** Worst teacher-side tag across a set of notebooks. */
export function worstTeacherTag(
  students: { statusTag?: string; band?: string; days?: number | null; obs?: string[] | null }[],
  classBand?: ClassBand | null,
): string {
  return (students || []).reduce(
    (w, s) => worseTag(w, splitStatus(s, classBand).tag), "Up-to-date");
}