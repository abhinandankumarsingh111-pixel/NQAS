import { getProfile, createClient } from "@/lib/supabase/server";
import { buildReportPdf, reportFileName, type PdfReport } from "@/lib/reportPdf";

export const dynamic = "force-dynamic";

/**
 * The report as a real PDF file.
 *
 * Built on the server rather than in the browser for two reasons. The obvious
 * one: the browser cannot be trusted to decide who may read a teacher's
 * record. The less obvious one: this file is the thing that gets forwarded, so
 * it is generated from the stored report every time and is never a snapshot
 * some client assembled from whatever it happened to have on screen.
 *
 * Access is narrower than viewing. A coordinator can open their own report and
 * a management user can open a shared one, but sending a teacher's record out
 * of the system and into a chat is a leadership decision, so only the owner and
 * the principal of that campus can produce this file.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { profile } = await getProfile();
  if (!profile) return new Response("Sign in first.", { status: 401 });

  const supabase = createClient();
  // RLS still applies: this only returns a row the caller was already allowed
  // to read. The role check below narrows it further.
  const { data: r } = await supabase.from("reports").select("*").eq("id", params.id).single();
  if (!r) return new Response("Report not found.", { status: 404 });

  const mayShare = profile.role === "owner"
    || (profile.role === "principal" && profile.campus_id === r.campus_id);
  if (!mayShare) {
    return new Response("Only the owner and the campus principal can share a report.", { status: 403 });
  }

  const { data: campus } = await supabase
    .from("campuses").select("name").eq("id", r.campus_id).single();

  const report: PdfReport = {
    campus: campus?.name || "—",
    coordinatorName: r.coordinator_name,
    date: r.date,
    teacher: r.teacher,
    cls: r.class,
    subject: r.subject,
    classBand: r.class_band,
    students: r.students || [],
    recs: r.recs || [],
    finalObservation: r.final_observation || "",
    principalSummary: r.principal_summary || "",
  };

  const bytes = buildReportPdf(report);
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      // "inline" so a phone can preview it before sending rather than dropping
      // it straight into downloads.
      "Content-Disposition": `inline; filename="${reportFileName(report)}"`,
      "Cache-Control": "no-store",
    },
  });
}
