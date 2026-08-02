import { redirect } from "next/navigation";
import { getProfile, createClient } from "@/lib/supabase/server";
import { BAND_ORDER } from "@/lib/observations";
import ReportListItem, { type ReportRow } from "@/components/ReportListItem";
import CampusSelect from "@/components/CampusSelect";

const worse = (a: string, b: string) => (BAND_ORDER.indexOf(a as never) >= BAND_ORDER.indexOf(b as never) ? a : b);

export default async function ReportsPage({ searchParams }: { searchParams: { campus?: string } }) {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");

  const isOwner = profile.role === "owner";
  // Coordinator and Principal are both campus-locked (enforced by RLS regardless of this UI logic).
  const isCampusLocked = profile.role === "coordinator" || profile.role === "principal";

  const supabase = createClient();
  // RLS automatically limits campus-locked roles to their own campus.
  const { data: reports } = await supabase.from("reports").select("*").order("created_at", { ascending: false });
  const { data: campuses } = await supabase.from("campuses").select("*");
  const camps = campuses || [];
  const campusName = (id: string | null) => camps.find((c) => c.id === id)?.name || "—";
  const repsAll = reports || [];

  // Campus filter only applies (and is only shown) for org-wide roles.
  const selectedCampusId = !isCampusLocked ? (searchParams?.campus || null) : null;
  const reps = selectedCampusId ? repsAll.filter((r) => r.campus_id === selectedCampusId) : repsAll;

  const rows: ReportRow[] = reps.map((r) => ({
    id: r.id, subject: r.subject, class: r.class, teacher: r.teacher,
    campusName: campusName(r.campus_id), date: r.date, coordinator_name: r.coordinator_name,
    sample_size: r.sample_size,
    worst: (r.students || []).reduce((w: string, s: { band: string }) => worse(w, s.band), "Excellent"),
  }));

  const heading = isCampusLocked ? "My Campus Reports" : `All Reports${selectedCampusId ? ` — ${campusName(selectedCampusId)}` : ""}`;

  return (
    <div className="card">
      <div className="card-h">
        <h2>{heading}</h2>
        {!isCampusLocked && <CampusSelect campuses={camps} value={selectedCampusId} basePath="/reports" />}
      </div>
      {rows.length === 0
        ? <div className="muted">No reports stored yet{selectedCampusId ? " for this campus" : ""}.</div>
        : rows.map((r) => <ReportListItem key={r.id} r={r} canDelete={isOwner} />)}
    </div>
  );
}
