import { redirect } from "next/navigation";
import { getProfile, createClient } from "@/lib/supabase/server";
import { ALL_STATUS_ORDER, tagColor, type ClassBand } from "@/lib/observations";
import { splitStatus, worstTeacherTag } from "@/lib/attribution";
import {
  coverage, isPeriodKind, resolvePeriod, rollUp,
  type ActivityEvent, type CoverageSubject, type PeriodKind, type RosterMember,
} from "@/lib/activity";
import ActivityTracker from "@/components/ActivityTracker";
import ReportListItem, { type ReportRow } from "@/components/ReportListItem";
import CampusSelect from "@/components/CampusSelect";
import MonthSelect, { type MonthOption } from "@/components/MonthSelect";

export const dynamic = "force-dynamic";

// What counts for the "Critical notebooks" stat card. "Critical" is the current
// name for the worst tier; "Overdue" is its retired name and "Major Concern" is
// the legacy band word, both kept so a stored tag from either era still counts.
const SERIOUS_TAGS = new Set(["Critical", "Overdue", "Major Concern"]);

// `days` recovers the teacher's checking status; `obs` separates her own
// checking faults from the pupil's, so neither the badge nor the counts below
// can be set by something the child did.
type StudentRow = { statusTag?: string; band?: string; days?: number | null; obs?: string[] | null };
type Report = {
  id: string; campus_id: string | null; subject: string; class: string; teacher: string;
  date: string; coordinator_name: string; coordinator_id: string | null;
  faculty_id: string | null; sample_size: number;
  class_band: ClassBand | null;
  students: StudentRow[] | null;
};

// ---------- Month filter helpers ----------
// Reports are grouped by calendar month (YYYY-MM, taken from the report's
// `date`) so Management/Principal can look at "this month" by default
// instead of scrolling a growing all-time list.

function monthKey(date: string | null | undefined): string {
  return (date || "").slice(0, 7); // "YYYY-MM"
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function buildMonthOptions(reps: Report[]): MonthOption[] {
  const counts: Record<string, number> = {};
  reps.forEach((r) => {
    const k = monthKey(r.date);
    if (k) counts[k] = (counts[k] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // most recent month first
    .map(([value, count]) => ({ value, label: monthLabel(value), count }));
}

// Explicit "?month=" (including "all") is always honoured. With no param at
// all (first visit), default to the current calendar month if it has any
// reports, else the most recent month that does, else "all".
function resolveMonth(requested: string | undefined, months: MonthOption[]): string {
  if (requested) return requested;
  const currentKey = new Date().toISOString().slice(0, 7);
  if (months.some((m) => m.value === currentKey)) return currentKey;
  return months[0]?.value || "all";
}

/** A verification, seen as one piece of work someone did. */
function verificationEvents(reps: Report[], person: (r: Report) => string | null): ActivityEvent[] {
  return reps
    .filter((r) => !!r.date)
    .map((r) => ({
      personId: person(r),
      date: r.date,
      subjectId: r.faculty_id,
      volume: r.students?.length || 0,
    }));
}

function hrefWith(base: string, params: Record<string, string | null | undefined>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, v); });
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

function computeStats(reps: Report[], camps: { id: string; name: string }[]) {
  const totalStudents = reps.reduce((n, r) => n + (r.students?.length || 0), 0);
  const reportingCampuses = new Set(reps.map((r) => r.campus_id)).size;
  const perCampus = camps.map((c) => ({ name: c.name, count: reps.filter((r) => r.campus_id === c.id).length }));
  const maxCampus = Math.max(1, ...perCampus.map((c) => c.count));

  // One pass, teacher-side throughout.
  //
  // These counts were previously tallied from the STORED tag, on the reasoning
  // that an org-wide census of notebook condition is worth having and is never
  // shown against an individual name. But "Critical notebooks" is read as a
  // judgement of checking, and the stored tag broke it in both directions: a
  // child's untidy notebook counted as one, while a genuine 24-day lag hid
  // behind "Index Missing" and counted as nothing.
  //
  // So the distribution reports her checking, and the census that reasoning was
  // protecting is kept as `pupilFlagged` and stated plainly beneath it.
  let serious = 0, pupilFlagged = 0;
  const tally: Record<string, number> = {};
  reps.forEach((r) => (r.students || []).forEach((s) => {
    const sp = splitStatus(s, r.class_band);
    if (SERIOUS_TAGS.has(sp.tag)) serious++;
    if (sp.pupilFlags.length) pupilFlagged++;
    tally[sp.tag] = (tally[sp.tag] || 0) + 1;
  }));
  const tagCount = Object.entries(tally)
    .sort((a, b) => ALL_STATUS_ORDER.indexOf(a[0]) - ALL_STATUS_ORDER.indexOf(b[0]))
    .map(([tag, count]) => ({ tag, color: tagColor(tag), count }));
  const maxTag = Math.max(1, ...tagCount.map((t) => t.count));

  return { totalStudents, serious, pupilFlagged, reportingCampuses, perCampus, maxCampus, tagCount, maxTag };
}

/** A labelled row of proportional bars. Shared so the campus breakdown and the
 *  status distribution are laid out identically instead of by two sets of
 *  hand-tuned inline widths that collapse differently on a phone. */
function DistBars({ title, rows, max }: {
  title: string;
  rows: { label: string; count: number; color?: string }[];
  max: number;
}) {
  return (
    <div className="dist">
      <div className="dist-h">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="dist-row">
          <span className="dist-l">{r.label}</span>
          <span className="dist-bar" aria-hidden="true">
            <span style={{ width: `${(r.count / max) * 100}%`, background: r.color || "var(--teal2)" }} />
          </span>
          <span className="dist-n">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

function PupilFlagNote({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <div className="muted" style={{ fontSize: 11, marginTop: 7, lineHeight: 1.5 }}>
      Status is the teacher&rsquo;s checking standing, taken from days since last checked.
      {" "}{n} notebook{n === 1 ? "" : "s"} also {n === 1 ? "carries a flag" : "carry flags"} raised
      by the pupil&rsquo;s own work, recorded on the report but not counted here.
    </div>
  );
}

// The badge shown beside a teacher's name in the report list. Teacher-side
// only: a pupil's missing index is not a mark against her checking.
function reportWorst(r: Report): string {
  return worstTeacherTag((r.students || []) as StudentRow[], r.class_band);
}

export default async function Dashboard({
  searchParams,
}: { searchParams: { campus?: string; month?: string; period?: string } }) {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");
  // Coordinators don't have a dashboard; send them to their work.
  if (profile.role === "coordinator") redirect("/verify");

  const isOwner = profile.role === "owner";
  const isPrincipal = profile.role === "principal";

  // The activity tracker keeps its own clock, separate from the month filter
  // on the report list below it: "who has been checking lately" and "show me
  // June's reports" are different questions and each card states its own range.
  const periodKind: PeriodKind = isPeriodKind(searchParams?.period) ? searchParams.period : "month";
  const period = resolvePeriod(periodKind);

  const supabase = createClient();
  const { data: campuses } = await supabase.from("campuses").select("*").order("name");
  const camps = campuses || [];
  const campusName = (id: string | null) => camps.find((c) => c.id === id)?.name || "—";

  // ---------- PRINCIPAL: entire dashboard locked to their own campus ----------
  if (isPrincipal) {
    const [{ data: reports }, { data: coordinators }, { data: faculty }] = await Promise.all([
      supabase.from("reports").select("*")
        .eq("campus_id", profile.campus_id) // defense-in-depth; RLS already enforces this
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name")
        .eq("role", "coordinator").eq("campus_id", profile.campus_id).order("name"),
      supabase.from("faculty").select("id, name, subject")
        .eq("campus_id", profile.campus_id).eq("active", true).order("name"),
    ]);
    const allReps = (reports || []) as Report[];
    const myCampus = camps.filter((c) => c.id === profile.campus_id);

    const months = buildMonthOptions(allReps);
    const selectedMonth = resolveMonth(searchParams?.month, months);
    const reps = selectedMonth === "all" ? allReps : allReps.filter((r) => monthKey(r.date) === selectedMonth);

    // Activity reads the WHOLE campus history and slices it by period itself —
    // never the month-filtered list, or the tracker would silently inherit a
    // filter set for a different card.
    const events = verificationEvents(allReps, (r) => r.coordinator_id);
    const roster: RosterMember[] = (coordinators || []) as RosterMember[];
    const subjects: CoverageSubject[] = ((faculty || []) as { id: string; name: string; subject: string | null }[])
      .map((f) => ({ id: f.id, name: f.name, detail: f.subject }));
    const people = rollUp(roster, events, period);
    const cov = coverage(subjects, events, period);

    const stats = computeStats(reps, myCampus);
    const rows: ReportRow[] = reps.map((r) => ({
      id: r.id, subject: r.subject, class: r.class, teacher: r.teacher,
      campusName: campusName(r.campus_id), date: r.date, coordinator_name: r.coordinator_name,
      sample_size: r.sample_size, worst: reportWorst(r),
    }));
    const monthHeading = selectedMonth === "all" ? "All time" : monthLabel(selectedMonth);

    return (
      <div>
        <ActivityTracker
          heading="Coordinator activity"
          people={people}
          coverage={cov}
          period={period}
          periodHref={(k) => hrefWith("/dashboard", { month: searchParams?.month, period: k })}
          noun={{ one: "verification", many: "verifications" }}
          subjectNoun="teachers"
          emptyRoster="No coordinators are registered for this campus yet, so there is nobody to track. Ask your administrator to add them."
          footnote={
            <>
              Counts verifications filed, by the date of the check. Everyone on your
              coordinator list is shown, including anyone who filed nothing — that is
              what this is for. Deliberately unranked and uncoloured: there is no
              published standard for how often a notebook should be verified, so this
              reports what happened and leaves the reading of it to you.
            </>
          }
        />

        <div className="card">
          <div className="card-h"><h2>Dashboard — {campusName(profile.campus_id)}</h2></div>
          <div className="row" style={{ marginBottom: 16 }}>
            <div className="stat"><b>{reps.length}</b><span>Reports stored</span></div>
            <div className="stat"><b>{stats.totalStudents}</b><span>Notebooks verified</span></div>
            <div className="stat"><b style={{ color: stats.serious ? "var(--red)" : "var(--navy)" }}>{stats.serious}</b><span>Critical notebooks</span></div>
          </div>
          <div style={{ maxWidth: 420 }}>
            <DistBars
              title={`Checking status distribution — ${monthHeading}`}
              rows={stats.tagCount.map((t) => ({ label: t.tag, count: t.count, color: t.color }))}
              max={stats.maxTag}
            />
            <PupilFlagNote n={stats.pupilFlagged} />
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Stored Reports — {monthHeading}</h2>
            <MonthSelect months={months} value={selectedMonth} basePath="/dashboard" />
          </div>
          {rows.length === 0
            ? <div className="muted">No reports {selectedMonth === "all" ? "yet" : "for this month"} for this campus.</div>
            : rows.map((r) => <ReportListItem key={r.id} r={r} canDelete={false} />)}
        </div>
      </div>
    );
  }

  // ---------- OWNER / MANAGEMENT: org-wide dashboard with campus + month filters ----------
  const [{ data: allReports }, { data: allFaculty }, { data: principals }, { data: obsActivity }] =
    await Promise.all([
      supabase.from("reports").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("faculty").select("id, name, campus_id").eq("active", true),
      supabase.from("profiles").select("id, name, campus_id").eq("role", "principal").order("name"),
      // Activity metadata only — who observed, when, whose class. Never the
      // scores or the words, which stay between the principal and the teacher
      // unless the principal shares them.
      supabase.rpc("observation_activity"),
    ]);
  const repsAll = (allReports || []) as Report[];
  const facultyAll = (allFaculty || []) as { id: string; name: string; campus_id: string }[];

  // Month list is built from the full org-wide dataset so it stays stable
  // regardless of which campus is currently selected.
  const months = buildMonthOptions(repsAll);
  const selectedMonth = resolveMonth(searchParams?.month, months);
  const repsInMonth = selectedMonth === "all" ? repsAll : repsAll.filter((r) => monthKey(r.date) === selectedMonth);

  // Summary stats reflect the selected month, org-wide (unaffected by the
  // campus filter below, same as the campus filter always only narrowed the list).
  const stats = computeStats(repsInMonth, camps);
  const monthHeading = selectedMonth === "all" ? "All time" : monthLabel(selectedMonth);

  // ---- campus-level verification activity ----
  // A campus with nobody on the teacher roll and no reports has not been set
  // up yet; listing it as "0 filed" would read as a campus falling behind when
  // it is a campus with nothing to check. Those are counted and named below
  // the tracker instead.
  const campusHasWork = (id: string) =>
    facultyAll.some((f) => f.campus_id === id) || repsAll.some((r) => r.campus_id === id);
  const liveCampuses = camps.filter((c) => campusHasWork(c.id));
  const dormant = camps.filter((c) => !campusHasWork(c.id));

  const campusEvents = verificationEvents(repsAll, (r) => r.campus_id);
  const campusPeople = rollUp(
    liveCampuses.map((c) => ({ id: c.id, name: c.name })), campusEvents, period);
  const campusCoverage = coverage(
    facultyAll.map((f) => ({ id: f.id, name: f.name })), campusEvents, period);

  // ---- principal observation activity ----
  const obsRows = (obsActivity || []) as {
    observer_id: string | null; campus_id: string | null; faculty_id: string | null; observed_on: string;
  }[];
  const principalRoster: RosterMember[] = ((principals || []) as { id: string; name: string; campus_id: string | null }[])
    .map((p) => ({ id: p.id, name: `${p.name}${p.campus_id ? ` · ${campusName(p.campus_id)}` : ""}` }));
  const obsEvents: ActivityEvent[] = obsRows
    .filter((o) => !!o.observed_on)
    .map((o) => ({ personId: o.observer_id, date: o.observed_on, subjectId: o.faculty_id, volume: 1 }));
  const principalPeople = rollUp(principalRoster, obsEvents, period);

  const selectedCampusId = searchParams?.campus || null;
  const repsForList = selectedCampusId ? repsInMonth.filter((r) => r.campus_id === selectedCampusId) : repsInMonth;
  const rows: ReportRow[] = repsForList.map((r) => ({
    id: r.id, subject: r.subject, class: r.class, teacher: r.teacher,
    campusName: campusName(r.campus_id), date: r.date, coordinator_name: r.coordinator_name,
    sample_size: r.sample_size, worst: reportWorst(r),
  }));

  // Plain-language empty state covering all four combinations of the two filters.
  const emptyMsg = (() => {
    const where = selectedCampusId ? campusName(selectedCampusId) : null;
    if (where && selectedMonth !== "all") return `No reports for ${where} in ${monthHeading}.`;
    if (where) return `No reports for ${where} yet.`;
    if (selectedMonth !== "all") return `No reports in ${monthHeading}.`;
    return "No reports yet. Coordinators' generated reports will appear here automatically.";
  })();

  const periodHref = (k: PeriodKind) =>
    hrefWith("/dashboard", { campus: selectedCampusId, month: searchParams?.month, period: k });

  return (
    <div>
      <ActivityTracker
        heading="Campus verification activity"
        people={campusPeople}
        coverage={campusCoverage}
        period={period}
        periodHref={periodHref}
        noun={{ one: "verification", many: "verifications" }}
        subjectNoun="teachers group-wide"
        emptyRoster="No campus has any teachers on roll yet."
        footnote={
          <>
            Counts verifications filed at each campus, by the date of the check.
            {dormant.length > 0 && (
              <> {dormant.length} campus{dormant.length === 1 ? " is" : "es are"} not
                listed because {dormant.length === 1 ? "it has" : "they have"} no teachers on
                roll yet: {dormant.map((c) => c.name).join(", ")}.</>
            )}{" "}
            Campuses are listed alphabetically, not ranked.
          </>
        }
      />

      <ActivityTracker
        heading="Principal observation activity"
        people={principalPeople}
        coverage={null}
        period={period}
        periodHref={periodHref}
        noun={{ one: "class observation", many: "class observations" }}
        subjectNoun="teachers"
        emptyRoster="No principals are registered yet."
        footnote={
          <>
            Counts submitted class observations only — a draft is not finished work.
            This shows <b>that</b> an observation happened and whose class it was, and
            deliberately nothing about what it said: scores and written feedback stay
            between the principal and the teacher unless the principal chooses to share
            that report.
          </>
        }
      />

      <div className="card">
        <div className="card-h"><h2>Management Dashboard — {monthHeading}</h2></div>
        <div className="row" style={{ marginBottom: 16 }}>
          <div className="stat"><b>{repsInMonth.length}</b><span>Reports stored</span></div>
          <div className="stat"><b>{stats.totalStudents}</b><span>Notebooks verified</span></div>
          <div className="stat"><b style={{ color: stats.serious ? "var(--red)" : "var(--navy)" }}>{stats.serious}</b><span>Critical notebooks</span></div>
          <div className="stat"><b>{stats.reportingCampuses} / {camps.length}</b><span>Campuses reporting</span></div>
        </div>
        <div className="row">
          <div style={{ flex: "1 1 280px", minWidth: 240 }}>
            <DistBars
              title="Reports per campus"
              rows={stats.perCampus.map((c) => ({ label: c.name, count: c.count }))}
              max={stats.maxCampus}
            />
          </div>
          <div style={{ flex: "1 1 280px", minWidth: 240 }}>
            <DistBars
              title="Checking status distribution"
              rows={stats.tagCount.map((t) => ({ label: t.tag, count: t.count, color: t.color }))}
              max={stats.maxTag}
            />
            <PupilFlagNote n={stats.pupilFlagged} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Stored Reports{selectedCampusId ? ` — ${campusName(selectedCampusId)}` : ""}</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <MonthSelect months={months} value={selectedMonth} campus={selectedCampusId} basePath="/dashboard" />
            <CampusSelect campuses={camps} value={selectedCampusId} month={selectedMonth} basePath="/dashboard" />
          </div>
        </div>
        {rows.length === 0
          ? <div className="muted">{emptyMsg}</div>
          : rows.map((r) => <ReportListItem key={r.id} r={r} canDelete={isOwner} />)}
      </div>
    </div>
  );
}
