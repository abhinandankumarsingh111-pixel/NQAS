import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile, createClient } from "@/lib/supabase/server";
import ReportView, { type ReportData } from "@/components/ReportView";
import ReportComments from "@/components/ReportComments";
import ShareReport from "@/components/ShareReport";

export const dynamic = "force-dynamic";

export default async function SingleReport({ params }: { params: { id: string } }) {
  const { profile, user } = await getProfile();
  if (!profile) redirect("/login");

  const supabase = createClient();
  // RLS ensures a coordinator can only fetch a report from their own campus,
  // and hides soft-deleted reports from every role.
  const { data: r } = await supabase.from("reports").select("*").eq("id", params.id).single();
  if (!r) notFound();

  const [{ data: campus }, { data: comments }] = await Promise.all([
    supabase.from("campuses").select("name").eq("id", r.campus_id).single(),
    // RLS decides what comes back: leadership sees remarks about the teacher,
    // the coordinator sees only those addressed to them.
    supabase.from("remarks").select("*").eq("report_id", params.id).order("created_at"),
  ]);

  const report: ReportData = {
    meta: { campus: campus?.name || "—", coordinatorName: r.coordinator_name, date: r.date },
    academic: { teacher: r.teacher, cls: r.class, subject: r.subject, classBand: r.class_band },
    students: r.students || [],
    recs: r.recs || [],
    finalObservation: r.final_observation,
    principalSummary: r.principal_summary,
    engine: r.engine,
  };

  const canComment = profile.role === "owner" || profile.role === "management"
    || (profile.role === "principal" && profile.campus_id === r.campus_id);

  // Sending a teacher's record out of the system is narrower than reading it:
  // a coordinator can open their own report and management can read a shared
  // one, but forwarding it into a chat is a leadership decision. The API route
  // enforces the same rule — this only decides whether the button is drawn.
  const canShare = profile.role === "owner"
    || (profile.role === "principal" && profile.campus_id === r.campus_id);

  const back = profile.role === "coordinator" ? "/reports" : "/dashboard";
  return (
    <div>
      <Link href={back} className="btn btn-ghost btn-sm no-print" style={{ marginBottom: 12 }}>← Back</Link>
      <ReportView
        r={report}
        share={canShare
          ? <ShareReport
              reportId={r.id}
              teacher={r.teacher}
              subject={r.subject}
              cls={r.class}
              date={r.date}
            />
          : undefined}
      />
      <ReportComments
        reportId={r.id}
        campusId={r.campus_id}
        facultyId={r.faculty_id}
        teacherName={r.teacher}
        coordinatorId={r.coordinator_id}
        coordinatorName={r.coordinator_name}
        canComment={canComment}
        isOwnReport={r.coordinator_id === user?.id}
        comments={(comments || []) as Record<string, unknown>[]}
      />
    </div>
  );
}
