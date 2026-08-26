// Staff activity: who is actually doing the checking, and who has been missed.
//
// This exists because coordinators were not filing verifications and nobody
// could see it. But "count what each person filed and rank them" is the wrong
// answer, and the research on exactly this problem is unusually clear about
// why. Four rules are load bearing here; each is enforced in this file rather
// than left to the page that renders it.
//
//  1. COVERAGE IS THE HEADLINE, NOT VOLUME. The useful leadership question is
//     "which teachers have not been checked", not "who filed the most". A
//     school with consistent templates but inconsistent frequency has good
//     data on the teachers it looks at and none on the ones it misses, and
//     that blind spot compounds. So coverage() is the primary figure and the
//     per-person counts sit underneath it.
//
//  2. NOBODY IS RANKED. The roster is returned in alphabetical order and the
//     caller must not re-sort it by count. A descending list of named
//     colleagues is a leaderboard whether or not it is labelled one, and the
//     field evidence is that performance transparency of that kind produces
//     conformity to the middle ("hide in the middle of the pack"), not
//     improvement. Ordering is by name, always.
//
//  3. A PERSON WHO FILED NOTHING STILL APPEARS. The roster comes from the
//     staff list, not from the reports — otherwise the one coordinator who did
//     no work is the one who vanishes from the report about who did the work.
//     This is the entire point of the feature and it is why rollUp() takes a
//     roster as well as events.
//
//  4. NO INVENTED QUOTA. There is no published standard for how often a
//     notebook should be verified — not in CBSE's SQAA framework, not
//     anywhere else that survives checking. So this file computes no target,
//     no "met / not met", and no red. It reports what happened and who was
//     missed, and leaves the judgement to the principal, who knows whether
//     last week was exam week.
//
// Pure and deterministic. No React, no I/O.

/** Week, calendar month, or academic session. */
export type PeriodKind = "week" | "month" | "year";

export const PERIOD_KINDS: PeriodKind[] = ["week", "month", "year"];

export interface Period {
  kind: PeriodKind;
  /** Inclusive ISO date (YYYY-MM-DD). */
  from: string;
  /** Inclusive ISO date. The period's true end, even if it is in the future. */
  to: string;
  /** Short name for a tab: "This week". */
  tab: string;
  /** Plain-language range, spelled out: "Mon 24 – Wed 26 August 2026". */
  range: string;
  /** True while the period is still running, so its totals are not yet final. */
  partial: boolean;
  /** Days of this period that have actually happened, including today. */
  elapsedDays: number;
}

// India runs on IST and the server does not. At 23:00 UTC it is already
// tomorrow in Rourkela, so a naive new Date() puts "this week" a day out for
// five and a half hours of every day. Every date in this file is an IST
// calendar date.
const IST_OFFSET_MIN = 330;

/** Today's date as it reads on a wall calendar in India. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

// ISO date strings compare correctly as plain strings, and every date this
// system stores is one. So the arithmetic converts to UTC Date only to add or
// subtract days, and converts straight back — no local timezone ever involved.
const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const asIso = (d: Date) => d.toISOString().slice(0, 10);

function addDays(iso: string, n: number): string {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return asIso(d);
}

/** Whole days from `a` to `b`, inclusive of both. */
function daysBetween(a: string, b: string): number {
  return Math.round((asDate(b).getTime() - asDate(a).getTime()) / 86400000) + 1;
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const dayName = (iso: string) => DAYS[asDate(iso).getUTCDay()];
const dayNum = (iso: string) => Number(iso.slice(8, 10));
const monthName = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1];
const yearOf = (iso: string) => iso.slice(0, 4);

/** The Monday on or before this date. School weeks here run Monday to Sunday. */
function mondayOf(iso: string): string {
  const dow = asDate(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

/**
 * The academic session containing this date. CBSE sessions run April to March,
 * so "this year" for a principal means April 2026 – March 2027, not January to
 * December. Labelling it a calendar year would put the summer break in the
 * middle of one year and the exam term in another.
 */
function sessionOf(iso: string): { from: string; to: string; label: string } {
  const y = Number(yearOf(iso));
  const start = Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
  return {
    from: `${start}-04-01`,
    to: `${start + 1}-03-31`,
    label: `Session ${start}–${String(start + 1).slice(2)}`,
  };
}

/** The period of the given kind that contains `today`. */
export function resolvePeriod(kind: PeriodKind, today: string = istToday()): Period {
  let from: string, to: string, tab: string, range: string;

  if (kind === "week") {
    from = mondayOf(today);
    to = addDays(from, 6);
    tab = "This week";
    range = spanLabel(from, to);
  } else if (kind === "month") {
    from = `${today.slice(0, 7)}-01`;
    to = asIso(new Date(Date.UTC(Number(yearOf(today)), Number(today.slice(5, 7)), 0)));
    tab = "This month";
    range = `${monthName(from)} ${yearOf(from)}`;
  } else {
    const s = sessionOf(today);
    from = s.from; to = s.to;
    tab = "This session";
    range = `${s.label} · April ${yearOf(from)} – March ${yearOf(to)}`;
  }

  const partial = today < to;
  return { kind, from, to, tab, range, partial, elapsedDays: daysBetween(from, partial ? today : to) };
}

/** "Mon 24 – Wed 26 August 2026", collapsing the month and year when shared. */
function spanLabel(from: string, to: string): string {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const head = `${dayName(from)} ${dayNum(from)}${sameMonth ? "" : ` ${monthName(from)}`}`;
  return `${head} – ${dayName(to)} ${dayNum(to)} ${monthName(to)} ${yearOf(to)}`;
}

/**
 * The comparable slice of the previous period.
 *
 * A part-finished week must never be compared against a finished one. On a
 * Tuesday morning "this week" is two days old, and holding it against seven
 * days of last week makes every coordinator in the school look like they have
 * stopped working. So the window returned here is clipped to the SAME number
 * of elapsed days, and the caller says so on screen ("last week by this day").
 */
export function comparableBefore(p: Period): { from: string; to: string; label: string } {
  const label = p.kind === "week" ? "last week" : p.kind === "month" ? "last month" : "last session";

  if (p.kind === "week") {
    const from = addDays(p.from, -7);
    return { from, to: addDays(from, p.elapsedDays - 1), label };
  }
  if (p.kind === "month") {
    const y = Number(yearOf(p.from)), m = Number(p.from.slice(5, 7));
    const from = asIso(new Date(Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, 1)));
    const end = asIso(new Date(Date.UTC(Number(yearOf(from)), Number(from.slice(5, 7)), 0)));
    const clipped = addDays(from, p.elapsedDays - 1);
    return { from, to: clipped < end ? clipped : end, label };
  }
  const from = `${Number(yearOf(p.from)) - 1}-04-01`;
  const end = `${Number(yearOf(p.from))}-03-31`;
  const clipped = addDays(from, p.elapsedDays - 1);
  return { from, to: clipped < end ? clipped : end, label };
}

export function isPeriodKind(v: string | undefined): v is PeriodKind {
  return v === "week" || v === "month" || v === "year";
}

// ---------------------------------------------------------------------------
// ROLL-UP
// ---------------------------------------------------------------------------

/** One piece of work someone filed: a verification, or a class observation. */
export interface ActivityEvent {
  /** The staff member who filed it. */
  personId: string | null;
  /** ISO date the work was done. */
  date: string;
  /** The teacher it was about — the unit of coverage. */
  subjectId: string | null;
  /** Notebooks examined, or 1 for a single observation. */
  volume: number;
}

/** Someone expected to be filing: a coordinator, or a principal. */
export interface RosterMember {
  id: string;
  name: string;
}

export interface PersonActivity {
  id: string;
  name: string;
  /** Pieces of work filed inside the period. */
  filed: number;
  /** Distinct teachers those pieces covered. Filing six times on the same
   *  teacher is six checks and one teacher, and the gap between the two
   *  numbers is the thing worth noticing. */
  teachers: number;
  /** Notebooks examined across those filings. */
  volume: number;
  /** Distinct days they filed on. Twenty checks on one day is not the same
   *  work as twenty checks across a month, and only this number tells them
   *  apart. */
  daysActive: number;
  /** Filed in the comparable slice of the previous period — see comparableBefore. */
  before: number;
  /** Most recent filing of ANY date, so "nothing this month" can still say
   *  when they were last seen. Null if they have never filed. */
  lastFiled: string | null;
}

/**
 * Fold events onto the roster for one period.
 *
 * Returned in alphabetical order by name, deliberately (rule 2). Everyone on
 * the roster comes back, including those with nothing at all (rule 3).
 */
export function rollUp(
  roster: RosterMember[],
  events: ActivityEvent[],
  period: Period,
): PersonActivity[] {
  const before = comparableBefore(period);

  const rows = roster.map((m) => {
    const mine = events.filter((e) => e.personId === m.id);
    const inPeriod = mine.filter((e) => e.date >= period.from && e.date <= period.to);
    const lastFiled = mine.reduce<string | null>((w, e) => (!w || e.date > w ? e.date : w), null);

    return {
      id: m.id,
      name: m.name,
      filed: inPeriod.length,
      teachers: new Set(inPeriod.map((e) => e.subjectId).filter(Boolean)).size,
      volume: inPeriod.reduce((n, e) => n + (e.volume || 0), 0),
      daysActive: new Set(inPeriod.map((e) => e.date)).size,
      before: mine.filter((e) => e.date >= before.from && e.date <= before.to).length,
      lastFiled,
    };
  });

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// COVERAGE — the headline figure (rule 1)
// ---------------------------------------------------------------------------

export interface CoverageSubject {
  id: string;
  name: string;
  detail?: string | null;
}

export interface Coverage {
  /** Teachers on the roll who could have been checked. */
  total: number;
  /** How many of them were, at least once, inside the period. */
  covered: number;
  /** The ones who were not. The actionable half of this whole feature. */
  missed: CoverageSubject[];
}

/** Which teachers were reached in this period, and which were not. */
export function coverage(
  subjects: CoverageSubject[],
  events: ActivityEvent[],
  period: Period,
): Coverage {
  const seen = new Set(
    events.filter((e) => e.date >= period.from && e.date <= period.to)
      .map((e) => e.subjectId).filter(Boolean) as string[],
  );
  const missed = subjects.filter((s) => !seen.has(s.id));
  return { total: subjects.length, covered: subjects.length - missed.length, missed };
}
