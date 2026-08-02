import { redirect } from "next/navigation";
import { getProfile, createClient } from "@/lib/supabase/server";
import { BAND_ORDER, BAND_META } from "@/lib/observations";
import ReportListItem, { type ReportRow } from "@/components/ReportListItem";
import CampusSelect from "@/components/CampusSelect";

const worseIndex = (a: string, b: string) => (BAND_ORDER.indexOf(a as never) >= BAND_ORDER.indexOf(b as never) ? a : b);

type Report = {
  id: string; campus_id: string | null; subject: string; class: string; teacher: string;
  date: string; coordinator_name: string; sample_size: number;
  students: { band: string }[] | null;
};

function computeStats(reps: Report[], camps: { id: string; name: string }[]) {
  const totalStudents = reps.reduce((n, r) => n + (r.students?.length || 0), 0);
  const serious = reps.reduce((n, r) =>
    n + (r.students || []).filter((s) => s.band === "Critical" || s.band === "Major Concern").length, 0);
  const reportingCampuses = new Set(reps.map((r) => r.campus_id)).size;
  const perCampus = camps.map((c) => ({ name: c.name, count: reps.filter((r) => r.campus_id === c.id).length }));
  const maxCampus = Math.max(1, ...perCampus.map((c) => c.count));
  const bandCount = BAND_ORDER.map((b) => ({
    band: b, color: BAND_META[b].color,
    count: reps.reduce((n, r) => n + (r.students || []).filter((s) => s.band === b).length, 0),
  }));
  const maxBand = Math.max(1, ...bandCount.map((b) => b.count));
  return { totalStudents, serious, reportingCampuses, perCampus, maxCampus, bandCount, maxBand };
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
      sample_size: r.sample_size,
      worst: (r.students || []).reduce((w: string, s: { band: string }) => worseIndex(w, s.band), "Excellent"),
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
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)", marginBottom: 8 }}>Assessment distribution</div>
            {stats.bandCount.map((b) => (
              <div key={b.band} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, width: 110, color: "var(--ink)" }}>{b.band}</span>
                <div style={{ flex: 1, background: "var(--chip)", borderRadius: 4, height: 16 }}>
                  <div style={{ width: `${(b.count / stats.maxBand) * 100}%`, background: b.color, height: "100%", borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, width: 20, textAlign: "right", color: "var(--sub)" }}>{b.count}</span>
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
    sample_size: r.sample_size,
    worst: (r.students || []).reduce((w: string, s: { band: string }) => worseIndex(w, s.band), "Excellent"),
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
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)", marginBottom: 8 }}>Assessment distribution</div>
            {stats.bandCount.map((b) => (
              <div key={b.band} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, width: 110, color: "var(--ink)" }}>{b.band}</span>
                <div style={{ flex: 1, background: "var(--chip)", borderRadius: 4, height: 16 }}>
                  <div style={{ width: `${(b.count / stats.maxBand) * 100}%`, background: b.color, height: "100%", borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, width: 20, textAlign: "right", color: "var(--sub)" }}>{b.count}</span>
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