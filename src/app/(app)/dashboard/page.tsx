import { redirect } from "next/navigation";
import { getProfile, createClient } from "@/lib/supabase/server";
import { ALL_STATUS_ORDER, tagColor, type ClassBand } from "@/lib/observations";
import { splitStatus, worstTeacherTag } from "@/lib/attribution";
import ReportListItem, { type ReportRow } from "@/components/ReportListItem";
import CampusSelect from "@/components/CampusSelect";
import MonthSelect, { type MonthOption } from "@/components/MonthSelect";


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
  date: string; coordinator_name: string; sample_size: number;
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

// The badge shown beside a teacher's name in the report list. Teacher-side
// only: a pupil's missing index is not a mark against her checking.
function reportWorst(r: Report): string {
  return worstTeacherTag((r.students || []) as StudentRow[], r.class_band);
}

export default async function Dashboard({ searchParams }: { searchParams: { campus?: string; month?: string } }) {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");
  // Coordinators don't have a dashboard; send them to their work.
  if (profile.role === "coordinator") redirect("/verify");

  const isOwner = profile.role === "owner";
  const isPrincipal = profile.role === "principal";

  const supabase = createClient();
  const { data: campuses } = await supabase.from("campuses").select("*").order("name");
  const camps = campuses || [];
  const campusName = (id: string | null) => camps.find((c) => c.id === id)?.name || "—";

  // ---------- PRINCIPAL: entire dashboard locked to their own campus ----------
  if (isPrincipal) {
    const { data: reports } = await supabase
      .from("reports").select("*")
      .eq("campus_id", profile.campus_id) // defense-in-depth; RLS already enforces this
      .order("created_at", { ascending: false });
    const allReps = (reports || []) as Report[];
    const myCampus = camps.filter((c) => c.id === profile.campus_id);

    const months = buildMonthOptions(allReps);
    const selectedMonth = resolveMonth(searchParams?.month, months);
    const reps = selectedMonth === "all" ? allReps : allReps.filter((r) => monthKey(r.date) === selectedMonth);

    const stats = computeStats(reps, myCampus);
    const rows: ReportRow[] = reps.map((r) => ({
      id: r.id, subject: r.subject, class: r.class, teacher: r.teacher,
      campusName: campusName(r.campus_id), date: r.date, coordinator_name: r.coordinator_name,
      sample_size: r.sample_size, worst: reportWorst(r),
    }));
    const monthHeading = selectedMonth === "all" ? "All time" : monthLabel(selectedMonth);

    return (
      <div>
        <div className="card">
          <div className="card-h"><h2>Dashboard — {campusName(profile.campus_id)}</h2></div>
          <div className="row" style={{ marginBottom: 16 }}>
            <div className="stat"><b>{reps.length}</b><span>Reports stored</span></div>
            <div className="stat"><b>{stats.totalStudents}</b><span>Notebooks verified</span></div>
            <div className="stat"><b style={{ color: stats.serious ? "var(--red)" : "var(--navy)" }}>{stats.serious}</b><span>Critical notebooks</span></div>
          </div>
          <div style={{ maxWidth: 380 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)", marginBottom: 8 }}>Checking status distribution — {monthHeading}</div>
            {stats.tagCount.map((t) => (
              <div key={t.tag} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, width: 130, color: "var(--ink)" }}>{t.tag}</span>
                <div style={{ flex: 1, background: "var(--chip)", borderRadius: 4, height: 16 }}>
                  <div style={{ width: `${(t.count / stats.maxTag) * 100}%`, background: t.color, height: "100%", borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, width: 20, textAlign: "right", color: "var(--sub)" }}>{t.count}</span>
              </div>
            ))}
            {stats.pupilFlagged > 0 && (
              <div className="muted" style={{ fontSize: 11, marginTop: 7, lineHeight: 1.5 }}>
                Status is the teacher&rsquo;s checking standing, taken from days since last checked.
                {" "}{stats.pupilFlagged} notebook{stats.pupilFlagged === 1 ? "" : "s"} also {stats.pupilFlagged === 1 ? "carries a flag" : "carry flags"} raised
                by the pupil&rsquo;s own work, recorded on the report but not counted here.
              </div>
            )}
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
  const { data: allReports } = await supabase.from("reports").select("*").order("created_at", { ascending: false });
  const repsAll = (allReports || []) as Report[];

  // Month list is built from the full org-wide dataset so it stays stable
  // regardless of which campus is currently selected.
  const months = buildMonthOptions(repsAll);
  const selectedMonth = resolveMonth(searchParams?.month, months);
  const repsInMonth = selectedMonth === "all" ? repsAll : repsAll.filter((r) => monthKey(r.date) === selectedMonth);

  // Summary stats reflect the selected month, org-wide (unaffected by the
  // campus filter below, same as the campus filter always only narrowed the list).
  const stats = computeStats(repsInMonth, camps);
  const monthHeading = selectedMonth === "all" ? "All time" : monthLabel(selectedMonth);

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

  return (
    <div>
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
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)", marginBottom: 8 }}>Reports per campus</div>
            {stats.perCampus.map((c) => (
              <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, width: 110, color: "var(--ink)" }}>{c.name}</span>
                <div style={{ flex: 1, background: "var(--chip)", borderRadius: 4, height: 16 }}>
                  <div style={{ width: `${(c.count / stats.maxCampus) * 100}%`, background: "var(--teal)", height: "100%", borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, width: 20, textAlign: "right", color: "var(--sub)" }}>{c.count}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: "1 1 280px", minWidth: 240 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)", marginBottom: 8 }}>Checking status distribution</div>
            {stats.tagCount.map((t) => (
              <div key={t.tag} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, width: 130, color: "var(--ink)" }}>{t.tag}</span>
                <div style={{ flex: 1, background: "var(--chip)", borderRadius: 4, height: 16 }}>
                  <div style={{ width: `${(t.count / stats.maxTag) * 100}%`, background: t.color, height: "100%", borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, width: 20, textAlign: "right", color: "var(--sub)" }}>{t.count}</span>
              </div>
            ))}
            {stats.pupilFlagged > 0 && (
              <div className="muted" style={{ fontSize: 11, marginTop: 7, lineHeight: 1.5 }}>
                Status is the teacher&rsquo;s checking standing, taken from days since last checked.
                {" "}{stats.pupilFlagged} notebook{stats.pupilFlagged === 1 ? "" : "s"} also {stats.pupilFlagged === 1 ? "carries a flag" : "carry flags"} raised
                by the pupil&rsquo;s own work, recorded on the report but not counted here.
              </div>
            )}
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