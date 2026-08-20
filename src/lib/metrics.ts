// Teacher copy-correction metrics.
//
// These figures may inform an employment decision, so five rules are load
// bearing. Each is enforced here rather than left to the caller:
//
//  1. ONLY the teacher's own work counts. Student presentation, index and
//     documentation are excluded (see TEACHER_ATTRIBUTABLE_OBS).
//  2. Timeliness reads the UNDERLYING day status, never the stored statusTag.
//     The stored tag applies overrides — two of which ("Documentation Issue",
//     "Index Missing") are the student's doing and would mask a prompt teacher.
//  3. Raw days are NOT comparable across class bands. 20 days is "Due Soon"
//     for Class VIII and "Critical" for Class III. The comparable figure is the
//     band-normalised status distribution.
//  4. A missing checking date is UNKNOWN, never a failure. Counting it would
//     score a blank field against her as if she had never checked the book, so
//     undated notebooks are excluded from timeliness entirely.
//  5. A tick the recorded date REFUTES is not counted. "Prolonged gap" on a
//     notebook checked the same day is one of two entries being wrong, and
//     there is no way to tell which — so it is reported as disputed rather
//     than charged to her. Both contradictions exist in live data.
//
// Pure and deterministic. No React, no I/O.

import { dayStatus, type ClassBand, type DayStatus } from "./observations";
import { countableFaults, disputedFaults } from "./attribution";

export const DAY_STATUS_ORDER: DayStatus[] = ["Up-to-date", "Due Soon", "Delayed", "Critical"];

/** Below this many verifications, figures are labelled provisional. */
export const PROVISIONAL_BELOW = 3;

export interface MetricStudent {
  days: number | null;
  obs?: string[] | null;
}

export interface MetricReport {
  id: string;
  date: string;
  campus_id: string | null;
  class_band: ClassBand | null;
  coordinator_id?: string | null;
  coordinator_name?: string | null;
  sampling_method?: string | null;
  students: MetricStudent[];
}

export interface TeacherMetrics {
  verifications: number;
  notebooks: number;
  periodFrom: string | null;
  periodTo: string | null;
  /** Band-normalised. The headline figure. */
  timeliness: Record<DayStatus, number>;
  timelinessPct: Record<DayStatus, number>;
  /** Share of notebooks at Delayed or Critical. */
  behindPct: number | null;
  /** Median days, per class band. Never merged across bands — see rule 3. */
  medianDaysByBand: Partial<Record<ClassBand, number>>;
  /** Share of notebooks carrying >= 1 teacher-attributable negative. */
  faultRate: number | null;
  criticalCount: number;
  /** Distinct coordinators. One coordinator throughout is weaker evidence. */
  coordinators: number;
  /** Notebooks with no observation ids recorded (pre-fix reports). */
  unscored: number;
  /** Notebooks with no last-checked date. Excluded from timeliness entirely. */
  undated: number;
  /** Ticks the recorded date refutes. Reported, never charged to her — rule 5. */
  disputed: number;
  provisional: boolean;
  samplingMethods: string[];
}

const EMPTY_TIMELINESS = (): Record<DayStatus, number> =>
  ({ "Up-to-date": 0, "Due Soon": 0, Delayed: 0, Critical: 0 });

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * Compute a teacher's copy-correction figures from their verifications.
 * Reports with no class band are skipped for timeliness (the thresholds are
 * band-specific and guessing would be worse than abstaining) but still count
 * toward observation-based figures.
 */
export function teacherMetrics(reports: MetricReport[]): TeacherMetrics {
  const timeliness = EMPTY_TIMELINESS();
  const daysByBand: Partial<Record<ClassBand, number[]>> = {};
  const coordinators = new Set<string>();
  const sampling = new Set<string>();
  let notebooks = 0, faulty = 0, critical = 0, unscored = 0, scored = 0, undated = 0, disputed = 0;
  let from: string | null = null, to: string | null = null;

  for (const r of reports) {
    if (r.coordinator_id) coordinators.add(r.coordinator_id);
    else if (r.coordinator_name) coordinators.add(r.coordinator_name);
    if (r.sampling_method) sampling.add(r.sampling_method);
    if (r.date) {
      if (!from || r.date < from) from = r.date;
      if (!to || r.date > to) to = r.date;
    }

    for (const s of r.students || []) {
      notebooks++;

      // Rules 2 and 4: derive from days, never from the stored statusTag,
      // and treat a missing date as unknown rather than as a lapse.
      if (s.days == null) {
        undated++;
      } else if (r.class_band) {
        timeliness[dayStatus(s.days, r.class_band)]++;
        (daysByBand[r.class_band] ||= []).push(s.days);
      }

      // Rules 1 and 5: only the teacher's own faults, and only those her own
      // recorded date does not refute.
      const obs = s.obs;
      if (!obs || obs.length === 0) { unscored++; continue; }
      scored++;
      const faults = countableFaults(obs, s.days, r.class_band);
      disputed += disputedFaults(obs, s.days, r.class_band).length;
      if (faults.length) faulty++;
      if (faults.includes("CI.no_teacher_check") || faults.includes("CI.long_gap")) critical++;
    }
  }

  const banded = DAY_STATUS_ORDER.reduce((n, k) => n + timeliness[k], 0);
  const timelinessPct = EMPTY_TIMELINESS();
  DAY_STATUS_ORDER.forEach((k) => { timelinessPct[k] = pct(timeliness[k], banded); });

  const medianDaysByBand: Partial<Record<ClassBand, number>> = {};
  (Object.keys(daysByBand) as ClassBand[]).forEach((b) => {
    const m = median(daysByBand[b]!);
    if (m !== undefined) medianDaysByBand[b] = m;
  });

  return {
    verifications: reports.length,
    notebooks,
    periodFrom: from,
    periodTo: to,
    timeliness,
    timelinessPct,
    behindPct: banded ? pct(timeliness.Delayed + timeliness.Critical, banded) : null,
    medianDaysByBand,
    faultRate: scored ? pct(faulty, scored) : null,
    criticalCount: critical,
    coordinators: coordinators.size,
    unscored,
    undated,
    disputed,
    provisional: reports.length < PROVISIONAL_BELOW,
    samplingMethods: [...sampling],
  };
}

/**
 * Campus baseline for the same period, so a teacher is read against peers
 * working the same calendar. A median of 11 days means one thing against a
 * campus median of 9 and the opposite in the fortnight after a holiday.
 */
export function campusBaseline(reports: MetricReport[]) {
  const m = teacherMetrics(reports);
  return {
    behindPct: m.behindPct,
    medianDaysByBand: m.medianDaysByBand,
    notebooks: m.notebooks,
    verifications: m.verifications,
  };
}

export const SAMPLING_LABEL: Record<string, string> = {
  random: "Random sample",
  spot: "Spot check",
  teacher_provided: "Teacher-provided",
};