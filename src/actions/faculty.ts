"use server";

import { createClient, getProfile } from "@/lib/supabase/server";
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

/**
 * Permanent removal, permitted ONLY where nothing is attached. Anything with a
 * verification or a remark is refused here and again by the database, which
 * holds reports and remarks under ON DELETE RESTRICT — so a personnel record
 * with history cannot be erased even by a mistake in this file.
 */
export async function deleteFacultyAction(facultyId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOwner();
  if ("error" in auth) return { ok: false, error: auth.error };

  const supabase = createClient();
  const [{ count: reportCount }, { count: remarkCount }] = await Promise.all([
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("faculty_id", facultyId),
    supabase.from("remarks").select("id", { count: "exact", head: true }).eq("faculty_id", facultyId),
  ]);
  if ((reportCount || 0) > 0 || (remarkCount || 0) > 0) {
    return { ok: false, error:
      `This teacher has ${reportCount || 0} verification(s) and ${remarkCount || 0} remark(s). ` +
      "A record with history cannot be deleted — deactivate it instead, or merge it into another record." };
  }

  const { error } = await supabase.from("faculty").delete().eq("id", facultyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/faculty");
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
