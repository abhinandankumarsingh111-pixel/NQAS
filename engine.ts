import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, createClient } from "@/lib/supabase/server";
import { BAND_ORDER } from "@/lib/observations";
import { bandChip } from "@/components/ReportView";

const worse = (a: string, b: string) => (BAND_ORDER.indexOf(a as never) >= BAND_ORDER.indexOf(b as never) ? a : b);

export default async function ReportsPage() {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");

  const supabase = createClient();
  // RLS automatically limits coordinators to their own campus.
  const { data: reports } = await supabase.from("reports").select("*").order("created_at", { ascending: false });
  const { data: campuses } = await supabase.from("campuses").select("*");
  const campusName = (id: string | null) => (campuses || []).find((c) => c.id === id)?.name || "—";
  const reps = reports || [];

  return (
    <div className="card">
      <div className="card-h"><h2>{profile.role === "coordinator" ? "My Campus Reports" : "All Reports"}</h2></div>
      {reps.length === 0
        ? <div className="muted">No reports stored yet.</div>
        : reps.map((r) => {
            const worst = (r.students || []).reduce((w: string, s: { band: string }) => worse(w, s.band), "Excellent");
            return (
              <Link key={r.id} href={`/reports/${r.id}`} style={{ display: "block", borderBottom: "1px solid var(--line-soft)", padding: "11px 2px", textDecoration: "none", color: "inherit" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <b style={{ color: "var(--navy)", fontSize: 14 }}>{r.subject} ({r.class})</b>
                    <span className="muted"> · {r.teacher} · {r.date}</span>
                    <div className="muted" style={{ fontSize: 12 }}>{campusName(r.campus_id)} · {r.sample_size} sample{r.sample_size > 1 ? "s" : ""}</div>
                  </div>
                  {bandChip(worst)}
                </div>
              </Link>
            );
          })}
    </div>
  );
}
