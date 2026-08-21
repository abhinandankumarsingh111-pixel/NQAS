import { redirect } from "next/navigation";
import { getProfile, createClient } from "@/lib/supabase/server";
import InCampusStart, { type TeacherOption } from "./InCampusStart";

export const dynamic = "force-dynamic";

/**
 * Teacher first, then the class.
 *
 * The spec asked for class -> section -> teacher appearing automatically, but
 * nothing in this system maps a class to a teacher: there is no timetable, and
 * the only class data that exists is free text typed onto past verifications
 * ("II A", "IIB", "IB", "2" all being Class 2). Guessing from that would put
 * the wrong name on a personnel record.
 *
 * So the principal picks the teacher — a real, campus-scoped list — and the
 * class, section and subject are pre-filled from what that teacher was last
 * verified teaching, editable in one tap. Same three taps, no invented data.
 *
 * The list is a starting point, not a limit: the picker can create a teacher
 * who has never had a notebook verification filed. Restricting observation to
 * teachers a coordinator happened to check first would be exactly backwards.
 */
export default async function InCampusStartPage() {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "principal") redirect("/observe");

  const supabase = createClient();
  const [{ data: faculty }, { data: reports }] = await Promise.all([
    supabase.from("faculty")
      .select("id, name, subject, subjects")
      .eq("campus_id", profile.campus_id).eq("active", true).order("name"),
    supabase.from("reports")
      .select("faculty_id, class, subject, date")
      .eq("campus_id", profile.campus_id).is("deleted_at", null)
      .order("date", { ascending: false }).limit(400),
  ]);

  // Most recent class and subject seen for each teacher, as a starting point.
  const lastSeen = new Map<string, { cls: string; subject: string }>();
  for (const r of reports || []) {
    if (!r.faculty_id || lastSeen.has(r.faculty_id)) continue;
    lastSeen.set(r.faculty_id, {
      cls: (r.class || "").trim(),
      subject: (r.subject || "").trim(),
    });
  }

  const teachers: TeacherOption[] = (faculty || []).map((f) => ({
    id: f.id,
    name: f.name,
    subject: (f.subjects && f.subjects.length ? f.subjects[0] : f.subject) || null,
    lastClass: lastSeen.get(f.id)?.cls || "",
    lastSubject: lastSeen.get(f.id)?.subject || "",
  }));

  return <InCampusStart teachers={teachers} campusId={profile.campus_id!} />;
}
