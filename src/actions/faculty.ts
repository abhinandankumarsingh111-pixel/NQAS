"use server";

import { createClient, getProfile } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

// ============================================================
// OWNER ONLY: faculty record management.
//
// Coordinators may ADD a teacher (they would otherwise be stuck mid-
// verification), but amending, transferring, deactivating and deleting a
// personnel record rests with the owner alone. Enforced by RLS as well as by
// the role checks here, so neither layer is load-bearing on its own.
// ============================================================

async function requireOwner() {
  const { profile, user } = await getProfile();
  if (!profile || !user) return { error: "Not authorised." as const };
  if (profile.role !== "owner") return { error: "Only the owner can manage faculty records." as const };
  return { profile, user };
}

export async function updateFacultyAction(
  facultyId: string,
  patch: { name?: string; subjects?: string[]; employeeCode?: string | null; campusId?: string; active?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOwner();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { profile, user } = auth;

  const supabase = createClient();
  const { data: before } = await supabase
    .from("faculty").select("id, name, subject, subjects, employee_code, campus_id, active")
    .eq("id", facultyId).single();
  if (!before) return { ok: false, error: "Teacher not found." };

  const name = patch.name !== undefined ? patch.name.trim().replace(/\s+/g, " ") : before.name;
  if (!name || name.length < 2) return { ok: false, error: "Enter the teacher's full name." };

  const subjects = patch.subjects !== undefined
    ? patch.subjects.map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean)
    : (before.subjects || []);
  const employeeCode = patch.employeeCode !== undefined
    ? (patch.employeeCode || "").trim().toUpperCase() || null
    : before.employee_code;
  const campusId = patch.campusId ?? before.campus_id;
  const active = patch.active ?? before.active;

  const { error } = await supabase.from("faculty")
    .update({ name, subjects, employee_code: employeeCode, campus_id: campusId, active })
    .eq("id", facultyId);
  if (error) {
    return { ok: false, error: /duplicate|unique/i.test(error.message)
      ? "Another teacher at this campus already has that name. Give one of them an employee code to tell them apart."
      : error.message };
  }

  const audit = async (action: string, detail: Record<string, unknown>) => {
    await supabase.from("faculty_audit").insert({
      faculty_id: facultyId, action, detail, actor_id: user.id, actor_name: profile.name,
    });
  };

  // A rename keeps the old name searchable: a teacher looked up years later may
  // well be under the name she had then.
  if (name !== before.name) {
    await supabase.from("faculty_previous_names").insert({
      faculty_id: facultyId, previous_name: before.name,
      changed_by: user.id, changed_by_name: profile.name,
    });
    await audit("renamed", { from: before.name, to: name });
  }
  if (JSON.stringify(subjects) !== JSON.stringify(before.subjects || [])) {
    await audit("subject_changed", { from: before.subjects || [], to: subjects });
  }
  // A campus change is a transfer, not a correction: the old posting is closed
  // and a new one opened, so past verifications stay attached to the campus
  // where they actually happened.
  if (campusId !== before.campus_id) {
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("faculty_postings")
      .update({ to_date: today }).eq("faculty_id", facultyId).is("to_date", null);
    await supabase.from("faculty_postings")
      .insert({ faculty_id: facultyId, campus_id: campusId, from_date: today });
    await audit("transferred", { from_campus: before.campus_id, to_campus: campusId });
  }
  if (active !== before.active) {
    await audit(active ? "reactivated" : "deactivated", {});
  }

  revalidatePath("/faculty");
  revalidatePath(`/faculty/${facultyId}`);
  return { ok: true };
}

/** One observation, seen only as "does this hold anything a person wrote?". */
interface ObsProbe {
  id: string;
  status: string | null;
  earned: number | null;
  answers: unknown;
  strengths: string | null;
  improvements: string | null;
  final_remark: string | null;
  topic: string | null;
  observed_on: string | null;
  observer_name: string | null;
}

/**
 * True when somebody actually recorded something on this observation.
 *
 * The start form writes class, subject and topic before the principal has
 * judged anything, so those are not content — they are the header of a blank
 * page. Content is a scored answer, a written note, or marks earned.
 */
function observationHasContent(o: ObsProbe): boolean {
  const a = o.answers;
  const answered = Array.isArray(a)
    ? a.length > 0
    : !!a && typeof a === "object" && Object.keys(a as object).length > 0;
  const written = [o.strengths, o.improvements, o.final_remark]
    .some((t) => (t || "").trim().length > 0);
  return answered || written || (o.earned || 0) > 0;
}

/**
 * Delete a faculty record.
 *
 * THREE tables can legitimately hold a teacher to a record — reports, remarks
 * and observations — and the database enforces all three with ON DELETE
 * RESTRICT. This used to check only the first two, so an observation would let
 * the delete through to the database and surface a raw foreign-key error
 * ("violates constraint observations_faculty_id_fkey") to a principal who has
 * no way to act on that sentence. Everything else that points at faculty
 * cascades, because it belongs to the record rather than being history about
 * the teacher.
 *
 * An EMPTY DRAFT observation is not history. It is what a double-tap on the
 * start form leaves behind: a header with no judgement in it, filed by nobody.
 * Refusing to delete a duplicate teacher because an abandoned blank form points
 * at it is the same mistake in a different place, so those are discarded with
 * the record and reported. A draft somebody actually wrote in is a different
 * matter and stops the deletion.
 */
export async function deleteFacultyAction(facultyId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOwner();
  if ("error" in auth) return { ok: false, error: auth.error };

  const supabase = createClient();
  const [{ count: reportCount }, { count: remarkCount }, { data: obsRows }] = await Promise.all([
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("faculty_id", facultyId),
    supabase.from("remarks").select("id", { count: "exact", head: true }).eq("faculty_id", facultyId),
    supabase.from("observations")
      .select("id, status, earned, answers, strengths, improvements, final_remark, topic, observed_on, observer_name")
      .eq("faculty_id", facultyId),
  ]);

  const observations = (obsRows || []) as ObsProbe[];
  const submitted = observations.filter((o) => o.status === "submitted");
  const startedDrafts = observations.filter((o) => o.status !== "submitted" && observationHasContent(o));
  const blankDrafts = observations.filter((o) => o.status !== "submitted" && !observationHasContent(o));

  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

  // Real history: refuse, and say exactly what is holding the record.
  const history: string[] = [];
  if (reportCount) history.push(plural(reportCount, "verification"));
  if (remarkCount) history.push(plural(remarkCount, "remark"));
  if (submitted.length) history.push(plural(submitted.length, "class observation"));
  if (history.length) {
    const list = history.length === 1 ? history[0]
      : `${history.slice(0, -1).join(", ")} and ${history[history.length - 1]}`;
    return { ok: false, error:
      `This teacher has ${list} on record, so the record cannot be deleted — that history would go with it. ` +
      `Use “Mark as left” to take them out of the pickers, or merge this record into the right one.` };
  }

  // An unfinished observation with something in it is somebody's work.
  if (startedDrafts.length) {
    const d = startedDrafts[0];
    const who = d.observer_name || "a principal";
    const when = d.observed_on || "an earlier date";
    return { ok: false, error:
      `There ${startedDrafts.length === 1 ? "is an unfinished class observation" : `are ${startedDrafts.length} unfinished class observations`} ` +
      `on this teacher — the first started by ${who} on ${when}. Finish or discard ${startedDrafts.length === 1 ? "it" : "them"} first, ` +
      `so nobody's work is thrown away with the record.` };
  }

  // Only blank drafts left. Clear them, then the record.
  //
  // Service-role: the owner may READ observations but not delete them, and
  // deliberately so — deleting a real observation goes through delete_observation(),
  // which demands a reason and leaves a permanent note behind. There is nothing
  // to memorialise about a blank form, so no such note is written here.
  if (blankDrafts.length) {
    const admin = adminClient();
    const { error: obsErr } = await admin
      .from("observations").delete().in("id", blankDrafts.map((o) => o.id));
    if (obsErr) return { ok: false, error: `Could not clear the blank draft observations: ${obsErr.message}` };
  }

  const { error } = await supabase.from("faculty").delete().eq("id", facultyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/faculty");
  revalidatePath("/observe");
  return { ok: true };
}

/**
 * Fold a duplicate record into the real one: verifications move across, the
 * duplicate's name is kept as a former name, and the empty shell is removed.
 *
 * Refused when the duplicate carries remarks. Remarks are append-only and
 * attributable to the record they were filed against; silently re-parenting
 * them would undo the guarantee that a filed remark is exactly what was
 * written, about exactly whom.
 */
export async function mergeFacultyAction(
  sourceId: string, targetId: string,
): Promise<{ ok: boolean; error?: string; moved?: number }> {
  const auth = await requireOwner();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { profile, user } = auth;
  if (sourceId === targetId) return { ok: false, error: "Choose two different records." };

  const supabase = createClient();
  const { data: src } = await supabase.from("faculty").select("id, name, campus_id").eq("id", sourceId).single();
  const { data: tgt } = await supabase.from("faculty").select("id, name").eq("id", targetId).single();
  if (!src || !tgt) return { ok: false, error: "One of those records no longer exists." };

  const { count: remarkCount } = await supabase
    .from("remarks").select("id", { count: "exact", head: true }).eq("faculty_id", sourceId);
  if ((remarkCount || 0) > 0) {
    return { ok: false, error:
      `"${src.name}" has ${remarkCount} remark(s) filed against it. Remarks are permanent and tied to the ` +
      "record they were written about, so they cannot be moved. Deactivate this record instead." };
  }

  const { data: moved, error: moveErr } = await supabase
    .from("reports").update({ faculty_id: targetId }).eq("faculty_id", sourceId).select("id");
  if (moveErr) return { ok: false, error: moveErr.message };

  await supabase.from("faculty_previous_names").insert({
    faculty_id: targetId, previous_name: src.name,
    changed_by: user.id, changed_by_name: profile.name,
  });
  await supabase.from("faculty_audit").insert({
    faculty_id: targetId, action: "merged",
    detail: { merged_from: src.name, verifications_moved: (moved || []).length },
    actor_id: user.id, actor_name: profile.name,
  });

  const { error: delErr } = await supabase.from("faculty").delete().eq("id", sourceId);
  if (delErr) return { ok: false, error: `Verifications moved, but the duplicate could not be removed: ${delErr.message}` };

  revalidatePath("/faculty");
  revalidatePath(`/faculty/${targetId}`);
  return { ok: true, moved: (moved || []).length };
}

// ------------------------------------------------------------
// COORDINATOR-CALLABLE: a genuinely different person with the same name.
//
// Names are unique per campus unless an employee code tells two people apart,
// and only the owner can set one. That left a coordinator who meets a second
// "Sunita Sharma" mid-verification with no way forward — and a blocked
// coordinator does not stop, she picks the existing Sunita and files the
// verification onto the wrong person's permanent record.
//
// So the escape hatch stays open: a provisional TEMP- code is minted, the new
// record is genuinely distinct, and it is flagged for the owner to replace with
// the real code. Nothing is ever silently merged into the wrong person.
// ------------------------------------------------------------
export async function addDistinctFacultyAction(
  campusId: string, rawName: string, rawSubject?: string,
): Promise<{ ok: boolean; id?: string; name?: string; subject?: string | null; error?: string }> {
  const { profile, user } = await getProfile();
  if (!profile || !user) return { ok: false, error: "Not authorised." };

  const name = String(rawName || "").trim().replace(/\s+/g, " ");
  const subject = String(rawSubject || "").trim().replace(/\s+/g, " ") || null;
  if (name.length < 2) return { ok: false, error: "Enter the teacher's full name." };

  const targetCampus = ["owner", "management"].includes(profile.role) ? campusId : profile.campus_id;
  if (!targetCampus) return { ok: false, error: "No campus on your account." };

  const supabase = createClient();
  const { data: sameName } = await supabase
    .from("faculty").select("id, name, employee_code").eq("campus_id", targetCampus);
  const clashes = (sameName || []).filter(
    (f: { name: string }) => f.name.trim().toLowerCase() === name.toLowerCase());
  if (clashes.length === 0) {
    return { ok: false, error: "No one of that name here yet — add them the usual way." };
  }

  const code = `TEMP-${clashes.length + 1}`;
  const { data, error } = await supabase.from("faculty")
    .insert({ campus_id: targetCampus, name, subjects: subject ? [subject] : [], employee_code: code })
    .select("id, name, subject").single();
  if (error) return { ok: false, error: error.message };

  await supabase.from("faculty_postings").insert({ faculty_id: data.id, campus_id: targetCampus });
  await supabase.from("faculty_audit").insert({
    faculty_id: data.id, action: "created",
    detail: {
      source: "verification form — declared a different person with the same name",
      provisional_code: code,
      needs_owner_review: "Replace the provisional code with the real employee code.",
    },
    actor_id: user.id, actor_name: profile.name,
  });

  revalidatePath("/faculty");
  return { ok: true, id: data.id, name: data.name, subject: data.subject };
}
