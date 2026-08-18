import { dayStatus, worseTag, type ClassBand } from "./observations";

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

// ---------------------------------------------------------------------------
// The same policy, applied to STATUS TAGS.
//
// statusTag() applies four overrides that REPLACE the day-based status. Two of
// them describe the pupil's own upkeep, not the teacher's checking:
//
//   Documentation Issue  — gaps in the child's classwork/homework entries
//   Index Missing        — the child has not maintained the index
//
// A notebook checked this morning (days = 0) whose owner has not filled in the
// index was being reported as "Index Missing" beside the teacher's name, which
// reads as a mark against her. It is not one — she checked it today.
//
// "Superficial" and "Critical" stay with the teacher: both describe the
// checking itself, not the child's work.
// ---------------------------------------------------------------------------
export const STUDENT_ATTRIBUTABLE_TAGS: ReadonlySet<string> = new Set([
  "Documentation Issue",
  "Index Missing",
]);

export function isStudentSideTag(tag: string): boolean {
  return STUDENT_ATTRIBUTABLE_TAGS.has(tag);
}

export interface SplitStatus {
  /** What the teacher is accountable for: her checking. */
  teacher: string;
  /** The pupil-side flag, kept so the child's record is not lost. */
  pupil: string | null;
}

/**
 * Separate a stored status into the teacher's checking and the pupil's upkeep.
 *
 * Where a pupil-side override hid the real checking status, it is recovered
 * from elapsed days — the same figure the teacher metrics use. Without a class
 * band the thresholds are unknown, so the stored tag is left alone rather than
 * guessed at.
 */
export function splitStatus(
  s: { statusTag?: string; band?: string; days?: number | null },
  classBand?: ClassBand | null,
): SplitStatus {
  const stored = s.statusTag || s.band || "Up-to-date";
  if (!isStudentSideTag(stored)) return { teacher: stored, pupil: null };
  if (!classBand) return { teacher: stored, pupil: null };
  return { teacher: dayStatus(s.days ?? null, classBand), pupil: stored };
}

/** Worst teacher-side status across a set of notebooks. */
export function worstTeacherTag(
  students: { statusTag?: string; band?: string; days?: number | null }[],
  classBand?: ClassBand | null,
): string {
  return (students || []).reduce(
    (w, s) => worseTag(w, splitStatus(s, classBand).teacher), "Up-to-date");
}
