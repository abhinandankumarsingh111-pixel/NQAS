import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, createClient } from "@/lib/supabase/server";
import { BAND_ORDER, BAND_META } from "@/lib/observations";
import { bandColor } from "@/lib/observations";

const worseIndex = (a: string, b: string) => (BAND_ORDER.indexOf(a as never) >= BAND_ORDER.indexOf(b as never) ? a : b);

export default async function Dashboard() {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");
  // Coordinators don't have a cross-campus dashboard; send them to their work.
  if (profile.role === "coordinator") redirect("/verify");

  const supabase = createClient();
  const [{ data: campuses }, { data: reports }] = await Promise.all([
    supabase.from("campuses").select("*").order("name"),
    supabase.from("reports").select("*").order("created_at", { ascending: false }),
  ]);

  const camps = campuses || [];
  const reps = reports || [];
  const campusName = (id: string | null) => camps.find((c) => c.id === id)?.name || "—";

  const totalStudents = reps.reduce((n, r) => n + (r.students?.length || 0), 0);
  const serious = reps.reduce((n, r) =>
    n + (r.students || []).filter((s: { band: string }) => s.band === "Critical" || s.band === "Major Concern").length, 0);
  const reportingCampuses = new Set(reps.map((r) => r.campus_id)).size;

  const perCampus = camps.map((c) => ({ name: c.name, count: reps.filter((r) => r.campus_id === c.id).length }));
  const maxCampus = Math.max(1, ...perCampus.map((c) => c.count));

  const bandCount = BAND_ORDER.map((b) => ({
    band: b, color: BAND_META[b].color,
    count: reps.reduce((n, r) => n + (r.students || []).filter((s: { band: string }) => s.band === b).length, 0),
  }));
  const maxBand = Math.max(1, ...bandCount.map((b) => b.count));

  return (
    <div>
      <div className="card">
        <div className="card-h"><h2>Management Dashboard</h2></div>
        <div className="row" style={{ marginBottom: 16 }}>
          <div className="stat"><b>{reps.length}</b><span>Reports stored</span></div>
          <div className="stat"><b>{totalStudents}</b><span>Notebooks verified</span></div>
          <div className="stat"><b style={{ color: serious ? "var(--red)" : "var(--navy)" }}>{serious}</b><span>Serious concerns</span></div>
          <div className="stat"><b>{reportingCampuses} / {camps.length}</b><span>Campuses reporting</span></div>
        </div>
        <div className="row">
          <div style={{ flex: "1 1 280px", minWidth: 240 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)", marginBottom: 8 }}>Reports per campus</div>
            {perCampus.map((c) => (
              <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, width: 110, color: "var(--ink)" }}>{c.name}</span>
                <div style={{ flex: 1, background: "var(--chip)", borderRadius: 4, height: 16 }}>
                  <div style={{ width: `${(c.count / maxCampus) * 100}%`, background: "var(--teal)", height: "100%", borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, width: 20, textAlign: "right", color: "var(--sub)" }}>{c.count}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: "1 1 280px", minWidth: 240 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)", marginBottom: 8 }}>Assessment distribution</div>
            {bandCount.map((b) => (
              <div key={b.band} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, width: 110, color: "var(--ink)" }}>{b.band}</span>
                <div style={{ flex: 1, background: "var(--chip)", borderRadius: 4, height: 16 }}>
                  <div style={{ width: `${(b.count / maxBand) * 100}%`, background: b.color, height: "100%", borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, width: 20, textAlign: "right", color: "var(--sub)" }}>{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h2>Stored Reports</h2></div>
        {reps.length === 0
          ? <div className="muted">No reports yet. Coordinators&apos; generated reports will appear here automatically.</div>
          : reps.map((r) => {
              const worst = (r.students || []).reduce((w: string, s: { band: string }) => worseIndex(w, s.band), "Excellent");
              return (
                <Link key={r.id} href={`/reports/${r.id}`} style={{ display: "block", borderBottom: "1px solid var(--line-soft)", padding: "11px 2px", textDecoration: "none", color: "inherit" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <div>
                      <b style={{ color: "var(--navy)", fontSize: 14 }}>{r.subject} ({r.class})</b>
                      <span className="muted"> · {r.teacher}</span>
                      <div className="muted" style={{ fontSize: 12 }}>{campusName(r.campus_id)} · {r.date} · by {r.coordinator_name} · {r.sample_size} sample{r.sample_size > 1 ? "s" : ""}</div>
                    </div>
                    <span className="band" style={{ background: bandColor(worst) }}>{worst}</span>
                  </div>
                </Link>
              );
            })}
      </div>
    </div>
  );
}
