import { redirect } from "next/navigation";
import { getProfile, createClient } from "@/lib/supabase/server";
import { ALL_STATUS_ORDER, studentTag, tagColor } from "@/lib/observations";
import ReportListItem, { type ReportRow } from "@/components/ReportListItem";
import CampusSelect from "@/components/CampusSelect";

const worseTag = (a: string, b: string) =>
  (ALL_STATUS_ORDER.indexOf(b) > ALL_STATUS_ORDER.indexOf(a) ? b : a);

// Any single report's most severe outcome, treated as a "serious concern"
// for the summary stat card. Covers both the legacy band words and the
// current NVS status tags.
const SERIOUS_TAGS = new Set(["Critical", "Overdue", "Major Concern"]);

type StudentRow = { statusTag?: string; band?: string };
type Report = {
  id: string; campus_id: string | null; subject: string; class: string; teacher: string;
  date: string; coordinator_name: string; sample_size: number;
  students: StudentRow[] | null;
};

function computeStats(reps: Report[], camps: { id: string; name: string }[]) {
  const totalStudents = reps.reduce((n, r) => n + (r.students?.length || 0), 0);
  const serious = reps.reduce((n, r) =>
    n + (r.students || []).filter((s) => SERIOUS_TAGS.has(studentTag(s))).length, 0);
  const reportingCampuses = new Set(reps.map((r) => r.campus_id)).size;
  const perCampus = camps.map((c) => ({ name: c.name, count: reps.filter((r) => r.campus_id === c.id).length }));
  const maxCampus = Math.max(1, ...perCampus.map((c) => c.count));

  // Tally whatever tag vocabulary actually appears in the data — old reports
  // and new reports can coexist and both display correctly.
  const tally: Record<string, number> = {};
  reps.forEach((r) => (r.students || []).forEach((s) => {
    const t = studentTag(s);
    tally[t] = (tally[t] || 0) + 1;
  }));
  const tagCount = Object.entries(tally)
    .sort((a, b) => ALL_STATUS_ORDER.indexOf(a[0]) - ALL_STATUS_ORDER.indexOf(b[0]))
    .map(([tag, count]) => ({ tag, color: tagColor(tag), count }));
  const maxTag = Math.max(1, ...tagCount.map((t) => t.count));

  return { totalStudents, serious, reportingCampuses, perCampus, maxCampus, tagCount, maxTag };
}

function reportWorst(r: Report): string {
  return (r.students || []).reduce((w: string, s: StudentRow) => worseTag(w, studentTag(s)), "Up-to-date");
}

export default async function Dashboard({ searchParams }: { searchParams: { campus?: string } }) {
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
    const reps = (reports || []) as Report[];
    const myCampus = camps.filter((c) => c.id === profile.campus_id);
    const stats = computeStats(reps, myCampus);
    const rows: ReportRow[] = reps.map((r) => ({
      id: r.id, subject: r.subject, class: r.class, teacher: r.teacher,
      campusName: campusName(r.campus_id), date: r.date, coordinator_name: r.coordinator_name,
      sample_size: r.sample_size, worst: reportWorst(r),
    }));

    return (
      <div>
        <div className="card">
          <div className="card-h"><h2>Dashboard — {campusName(profile.campus_id)}</h2></div>
          <div className="row" style={{ marginBottom: 16 }}>
            <div className="stat"><b>{reps.length}</b><span>Reports stored</span></div>
            <div className="stat"><b>{stats.totalStudents}</b><span>Notebooks verified</span></div>
            <div className="stat"><b style={{ color: stats.serious ? "var(--red)" : "var(--navy)" }}>{stats.serious}</b><span>Serious concerns</span></div>
          </div>
          <div style={{ maxWidth: 380 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)", marginBottom: 8 }}>Status distribution</div>
            {stats.tagCount.map((t) => (
              <div key={t.tag} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, width: 130, color: "var(--ink)" }}>{t.tag}</span>
                <div style={{ flex: 1, background: "var(--chip)", borderRadius: 4, height: 16 }}>
                  <div style={{ width: `${(t.count / stats.maxTag) * 100}%`, background: t.color, height: "100%", borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, width: 20, textAlign: "right", color: "var(--sub)" }}>{t.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Stored Reports</h2></div>
          {rows.length === 0
            ? <div className="muted">No reports yet for this campus.</div>
            : rows.map((r) => <ReportListItem key={r.id} r={r} canDelete={false} />)}
        </div>
      </div>
    );
  }

  // ---------- OWNER / MANAGEMENT: org-wide dashboard with a campus filter on Stored Reports ----------
  const { data: allReports } = await supabase.from("reports").select("*").order("created_at", { ascending: false });
  const repsAll = (allReports || []) as Report[];
  const stats = computeStats(repsAll, camps);

  const selectedCampusId = searchParams?.campus || null;
  const repsForList = selectedCampusId ? repsAll.filter((r) => r.campus_id === selectedCampusId) : repsAll;
  const rows: ReportRow[] = repsForList.map((r) => ({
    id: r.id, subject: r.subject, class: r.class, teacher: r.teacher,
    campusName: campusName(r.campus_id), date: r.date, coordinator_name: r.coordinator_name,
    sample_size: r.sample_size, worst: reportWorst(r),
  }));

  return (
    <div>
      <div className="card">
        <div className="card-h"><h2>Management Dashboard</h2></div>
        <div className="row" style={{ marginBottom: 16 }}>
          <div className="stat"><b>{repsAll.length}</b><span>Reports stored</span></div>
          <div className="stat"><b>{stats.totalStudents}</b><span>Notebooks verified</span></div>
          <div className="stat"><b style={{ color: stats.serious ? "var(--red)" : "var(--navy)" }}>{stats.serious}</b><span>Serious concerns</span></div>
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
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)", marginBottom: 8 }}>Status distribution</div>
            {stats.tagCount.map((t) => (
              <div key={t.tag} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, width: 130, color: "var(--ink)" }}>{t.tag}</span>
                <div style={{ flex: 1, background: "var(--chip)", borderRadius: 4, height: 16 }}>
                  <div style={{ width: `${(t.count / stats.maxTag) * 100}%`, background: t.color, height: "100%", borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, width: 20, textAlign: "right", color: "var(--sub)" }}>{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Stored Reports{selectedCampusId ? ` — ${campusName(selectedCampusId)}` : ""}</h2>
          <CampusSelect campuses={camps} value={selectedCampusId} basePath="/dashboard" />
        </div>
        {rows.length === 0
          ? <div className="muted">No reports {selectedCampusId ? "for this campus" : "yet"}. Coordinators&apos; generated reports will appear here automatically.</div>
          : rows.map((r) => <ReportListItem key={r.id} r={r} canDelete={isOwner} />)}
      </div>
    </div>
  );
}
