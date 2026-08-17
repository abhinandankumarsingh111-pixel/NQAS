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
