import { redirect } from "next/navigation";
import { getProfile, createClient } from "@/lib/supabase/server";
import { worstTeacherTag } from "@/lib/attribution";
import ReportListItem, { type ReportRow } from "@/components/ReportListItem";
import CampusSelect from "@/components/CampusSelect";

export default async function ReportsPage({ searchParams }: { searchParams: { campus?: string } }) {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");

  const isOwner = profile.role === "owner";
  // Coordinator and Principal are both campus-locked (no campus selector shown),
  // but their actual scope differs — enforced by RLS regardless of this UI logic:
  //   coordinator -> only reports they personally created
  //   principal   -> every report for their one campus
  const isCampusLocked = profile.role === "coordinator" || profile.role === "principal";

  const supabase = createClient();
  // RLS scopes this query automatically per the rules above.
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
    worst: worstTeacherTag(r.students || [], r.class_band),
  }));

  const heading = profile.role === "coordinator" ? "My Reports"
    : profile.role === "principal" ? "Campus Reports"
    : `All Reports${selectedCampusId ? ` — ${campusName(selectedCampusId)}` : ""}`;

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
