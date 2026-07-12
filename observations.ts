import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile, createClient } from "@/lib/supabase/server";
import ReportView, { type ReportData } from "@/components/ReportView";

export default async function SingleReport({ params }: { params: { id: string } }) {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");

  const supabase = createClient();
  // RLS ensures a coordinator can only fetch a report from their own campus.
  const { data: r } = await supabase.from("reports").select("*").eq("id", params.id).single();
  if (!r) notFound();
  const { data: campus } = await supabase.from("campuses").select("name").eq("id", r.campus_id).single();

  const report: ReportData = {
    meta: { campus: campus?.name || "—", coordinatorName: r.coordinator_name, date: r.date },
    academic: { teacher: r.teacher, cls: r.class, subject: r.subject },
    students: r.students || [],
    recs: r.recs || [],
    finalObservation: r.final_observation,
    principalSummary: r.principal_summary,
    engine: r.engine,
  };

  const back = profile.role === "coordinator" ? "/reports" : "/dashboard";
  return (
    <div>
      <Link href={back} className="btn btn-ghost btn-sm no-print" style={{ marginBottom: 12 }}>← Back</Link>
      <ReportView r={report} />
    </div>
  );
}
