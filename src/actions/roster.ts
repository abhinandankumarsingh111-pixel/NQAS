"use server";

import { createClient, getProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { parseFacultyImport } from "@/lib/facultyImport";

// ============================================================
// OWNER ONLY: bulk roster import.
//
// Kept apart from the single-teacher actions in faculty.ts because it answers
// a different question. Those exist so a coordinator is not stuck mid-
// verification; this one creates personnel records forty at a time and belongs
// with renaming and deleting them — the owner's work.
//
// The parse and the duplicate check already ran in the browser so the owner
// could see what was about to happen. That preview is a courtesy, not a
// control. Everything is parsed and checked again here against a fresh read of
// the roll, because the rows arriving at this function are whatever the client
// chose to send, and because someone else may have added a teacher in the
// minute between the preview and the confirm.
//
// Every created record is audited with source "bulk import", so a name that
// turns out to be wrong later can be traced back to the paste it came from.
// ============================================================
export async function importFacultyAction(
  campusId: string,
  rawText: string,
): Promise<{ ok: boolean; created?: number; skipped?: number; error?: string }> {
  const { profile, user } = await getProfile();
  if (!profile || !user) return { ok: false, error: "Not authorised." };
  if (profile.role !== "owner") {
    return { ok: false, error: "Only the owner can import a roster." };
  }

  if (!campusId) return { ok: false, error: "Choose a campus to import into." };
  if (!rawText || !rawText.trim()) return { ok: false, error: "Nothing to import." };

  const supabase = createClient();
  const { data: campus } = await supabase
    .from("campuses").select("id, name").eq("id", campusId).single();
  if (!campus) return { ok: false, error: "Campus not found." };

  // Re-read the roll now, rather than trusting whatever the browser was shown.
  const { data: onRoll } = await supabase
    .from("faculty").select("name").eq("campus_id", campusId);
  const parsed = parseFacultyImport(rawText, (onRoll || []).map((f: { name: string }) => f.name));

  if (parsed.importable.length === 0) {
    return { ok: false, error: "No new teachers in that list — every row was blank, repeated, or already on the roll." };
  }
  // A guard against a paste that is clearly not a roster. Forty is already a
  // large secondary department; four hundred is an accident.
  if (parsed.importable.length > 400) {
    return { ok: false, error: `That is ${parsed.importable.length} rows. Import in batches of 400 or fewer.` };
  }

  const { data: created, error } = await supabase
    .from("faculty")
    .insert(parsed.importable.map((r) => ({
      campus_id: campusId,
      name: r.name,
      subject: r.subjects[0] || null,
      subjects: r.subjects,
      employee_code: r.employeeCode,
      active: true,
    })))
    .select("id, name");

  if (error) {
    return { ok: false, error: /duplicate|unique/i.test(error.message)
      ? "Someone added one of these teachers while you were reviewing. Run the import again — the preview will skip them."
      : error.message };
  }

  const rows = (created || []) as { id: string; name: string }[];
  if (rows.length) {
    await supabase.from("faculty_postings").insert(
      rows.map((f) => ({ faculty_id: f.id, campus_id: campusId })));
    await supabase.from("faculty_audit").insert(
      rows.map((f) => ({
        faculty_id: f.id,
        action: "created",
        detail: { source: "bulk import", campus: campus.name, batch_size: rows.length },
        actor_id: user.id,
        actor_name: profile.name,
      })));
  }

  revalidatePath("/faculty");
  return {
    ok: true,
    created: rows.length,
    skipped: parsed.rows.length - parsed.importable.length,
  };
}
