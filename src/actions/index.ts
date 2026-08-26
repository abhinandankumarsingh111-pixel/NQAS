"use server";

import { createClient, getProfile } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isTeacherFault } from "@/lib/attribution";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const DOMAIN = process.env.NEXT_PUBLIC_ID_DOMAIN || "nqas.local";
const idToEmail = (id: string) => `${id.trim().toLowerCase()}@${DOMAIN}`;

// ---------- LOGIN ----------
export async function loginAction(_prev: unknown, formData: FormData) {
  const id = String(formData.get("loginId") || "");
  const password = String(formData.get("password") || "");
  if (!id || !password) return { error: "Enter your login ID and password." };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: idToEmail(id), password });
  if (error) return { error: "Invalid login ID or password." };
  redirect("/dashboard");
}

// ---------- LOGOUT ----------
export async function logoutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------- FIRST-RUN SETUP: create the owner ----------
export async function setupAction(_prev: unknown, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const id = String(formData.get("loginId") || "").trim();
  const password = String(formData.get("password") || "");
  if (!name || !id) return { error: "Name and login ID are required." };
  if (password.length < 6) return { error: "Password must be at least 6 characters." };

  const admin = adminClient();

  // Refuse if an owner already exists.
  const { data: existing } = await admin.from("profiles").select("id").eq("role", "owner").limit(1);
  if (existing && existing.length > 0) return { error: "Setup already complete. Please sign in." };

  const { error } = await admin.auth.admin.createUser({
    email: idToEmail(id),
    password,
    email_confirm: true,
    user_metadata: { name, role: "owner", login_id: id.toLowerCase() },
  });
  if (error) return { error: error.message };

  // Sign the new owner in immediately.
  const supabase = createClient();
  await supabase.auth.signInWithPassword({ email: idToEmail(id), password });
  redirect("/dashboard");
}

// ---------- OWNER: create a management/principal/coordinator ID ----------
export async function createUserAction(_prev: unknown, formData: FormData) {
  const { profile } = await getProfile();
  if (profile?.role !== "owner") return { error: "Not authorised." };

  const name = String(formData.get("name") || "").trim();
  const id = String(formData.get("loginId") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "coordinator");
  const password = String(formData.get("password") || "");
  const campus_id = String(formData.get("campusId") || "") || null;

  // Coordinator and Principal are both campus-locked roles and require a campus.
  const needsCampus = role === "coordinator" || role === "principal";

  if (!name || !id) return { error: "Name and login ID are required." };
  if (password.length < 6) return { error: "Password must be at least 6 characters." };
  if (needsCampus && !campus_id) return { error: "Choose a campus for this role." };

  const admin = adminClient();
  const { error } = await admin.auth.admin.createUser({
    email: idToEmail(id),
    password,
    email_confirm: true,
    user_metadata: { name, role, login_id: id, campus_id: needsCampus ? campus_id : "" },
  });
  if (error) return { error: error.message.includes("already") ? "That login ID already exists." : error.message };

  revalidatePath("/admin");
  return { ok: `Created ${role} ID "${id}". Share the ID and password with them.` };
}

// ---------- OWNER: edit an existing account ----------
//
// Name, login ID, role and campus. Two stores have to agree: Supabase Auth
// holds the sign-in email and the metadata, `profiles` holds what every RLS
// policy actually reads. The trigger that copies one to the other only fires
// on INSERT, so an edit must write BOTH explicitly or the two drift apart —
// and a profile whose role disagrees with its metadata is a permissions bug
// waiting to happen.
//
// The owner may edit their own name and password (nobody else can), but not
// their own role or campus: demoting yourself is the one change that cannot
// be undone from inside the product, because there would be no owner left to
// undo it with.
export async function updateUserAction(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; ok?: string }> {
  const { profile, user } = await getProfile();
  if (profile?.role !== "owner") return { error: "Not authorised." };

  const targetId = String(formData.get("userId") || "");
  const name = String(formData.get("name") || "").trim().replace(/\s+/g, " ");
  const loginId = String(formData.get("loginId") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "");
  const campus_id = String(formData.get("campusId") || "") || null;

  if (!targetId) return { error: "Missing account." };
  if (name.length < 2) return { error: "Enter the person's full name." };
  if (!/^[a-z0-9._-]{3,}$/.test(loginId)) {
    return { error: "Login ID must be at least 3 characters: letters, numbers, dot, dash or underscore." };
  }

  const isSelf = targetId === user?.id;
  const admin = adminClient();

  const { data: before } = await admin
    .from("profiles").select("role, login_id, name, campus_id").eq("id", targetId).single();
  if (!before) return { error: "Account not found." };

  // Role/campus are only editable on OTHER people's accounts. On your own,
  // whatever you already are is preserved regardless of what was posted.
  let nextRole = before.role, nextCampus: string | null = before.campus_id ?? null;
  if (!isSelf) {
    if (!["coordinator", "principal", "management"].includes(role)) return { error: "Invalid role." };
    const needsCampus = role === "coordinator" || role === "principal";
    if (needsCampus && !campus_id) return { error: "Choose a campus for this role." };
    nextRole = role;
    nextCampus = needsCampus ? campus_id : null;
  }

  // Login ID is the sign-in credential, so a change here changes how this
  // person signs in. Refuse a collision up front rather than letting the auth
  // layer return something the owner has to decode.
  if (loginId !== (before.login_id || "")) {
    const { data: taken } = await admin
      .from("profiles").select("id").eq("login_id", loginId).neq("id", targetId).limit(1);
    if (taken && taken.length) return { error: `Login ID "${loginId}" is already in use.` };
  }

  const { error: authErr } = await admin.auth.admin.updateUserById(targetId, {
    email: idToEmail(loginId),
    email_confirm: true,
    user_metadata: { name, role: nextRole, login_id: loginId, campus_id: nextCampus || "" },
  });
  if (authErr) {
    return { error: /already|registered|exists/i.test(authErr.message)
      ? `Login ID "${loginId}" is already in use.` : authErr.message };
  }

  const { error } = await admin
    .from("profiles")
    .update({ name, login_id: loginId, role: nextRole, campus_id: nextCampus })
    .eq("id", targetId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  const renamedId = loginId !== (before.login_id || "");
  return { ok: renamedId
    ? `Saved. ${name} now signs in with the ID "${loginId}" — tell them, the old one no longer works.`
    : "Account updated." };
}

// ---------- OWNER: set someone's password ----------
//
// Set, not "send a reset link": login IDs are synthetic addresses at an
// internal domain, so there is no inbox for a reset mail to arrive in. The
// owner sets a password and passes it on, which is how every account here was
// created in the first place.
export async function resetPasswordAction(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; ok?: string }> {
  const { profile } = await getProfile();
  if (profile?.role !== "owner") return { error: "Not authorised." };

  const targetId = String(formData.get("userId") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  if (!targetId) return { error: "Missing account." };
  if (password.length < 6) return { error: "Password must be at least 6 characters." };
  if (password !== confirm) return { error: "The two passwords do not match." };

  const admin = adminClient();
  const { data: who } = await admin.from("profiles").select("name, login_id").eq("id", targetId).single();
  const { error } = await admin.auth.admin.updateUserById(targetId, { password });
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: `Password set for ${who?.name || "this account"} (${who?.login_id || "—"}). ` +
    `They are not signed out — it applies the next time they sign in.` };
}

// ---------- OWNER: rename a campus or change its code ----------
export async function updateCampusAction(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; ok?: string }> {
  const { profile } = await getProfile();
  if (profile?.role !== "owner") return { error: "Not authorised." };

  const campusId = String(formData.get("campusId") || "");
  const name = String(formData.get("campusName") || "").trim().replace(/\s+/g, " ");
  const code = String(formData.get("campusCode") || "").trim().toUpperCase() || null;
  if (!campusId) return { error: "Missing campus." };
  if (name.length < 2) return { error: "Enter a campus name." };

  const supabase = createClient();
  const { data: existing } = await supabase.from("campuses").select("id, name, code");
  const clash = (existing || []).find(
    (c: { id: string; name: string; code: string | null }) => c.id !== campusId && (
      c.name.trim().toLowerCase() === name.toLowerCase() ||
      (code !== null && (c.code || "").trim().toUpperCase() === code)
    ));
  if (clash) return { error: `That name or code already belongs to "${clash.name}".` };

  const { error } = await supabase.from("campuses").update({ name, code }).eq("id", campusId);
  if (error) {
    return { error: /duplicate|unique/i.test(error.message)
      ? "Another campus already uses that name or code." : error.message };
  }
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { ok: `Saved "${name}".` };
}

// ---------- OWNER: delete a login ID ----------
export async function deleteUserAction(userId: string) {
  const { profile, user } = await getProfile();
  if (profile?.role !== "owner") return;
  if (userId === user?.id) return; // never delete yourself
  const admin = adminClient();
  await admin.auth.admin.deleteUser(userId);
  revalidatePath("/admin");
}

// ---------- OWNER: add a campus ----------
export async function addCampusAction(_prev: unknown, formData: FormData) {
  const { profile } = await getProfile();
  if (profile?.role !== "owner") return { error: "Not authorised." };
  const name = String(formData.get("campusName") || "").trim();
  const code = String(formData.get("campusCode") || "").trim().toUpperCase() || null;
  if (!name) return { error: "Enter a campus name." };
  const supabase = createClient();

  // Friendly duplicate check on both name and code, compared case-insensitively
  // so "KV Global School, Raipur" and "kv global school, raipur" are one campus.
  // The database enforces the same rule via unique indexes on lower(name) and
  // upper(code), so a concurrent insert still fails safely at the insert below.
  const { data: existing } = await supabase.from("campuses").select("name, code");
  const clash = (existing || []).find(
    (c) => c.name.trim().toLowerCase() === name.toLowerCase() ||
           (code !== null && (c.code || "").trim().toUpperCase() === code)
  );
  if (clash) return { error: `Already on the roster as "${clash.name}".` };

  const { error } = await supabase.from("campuses").insert({ name, code });
  if (error) {
    return { error: /duplicate|unique/i.test(error.message) ? "That campus is already on the roster." : error.message };
  }
  revalidatePath("/admin");
  return { ok: `Added campus "${name}".` };
}

// ---------- ANY CAMPUS USER: add a teacher to the faculty list ----------
// Coordinators may add (they would otherwise be stuck mid-verification), but
// the three gates in TeacherPicker run first, and the database enforces
// uniqueness on (campus, normalised name, normalised subject) regardless.
export async function addFacultyAction(
  campusId: string, rawName: string, rawSubject?: string,
): Promise<{ ok: boolean; id?: string; name?: string; subject?: string | null; error?: string }> {
  const { profile, user } = await getProfile();
  if (!profile || !user) return { ok: false, error: "Not authorised." };

  const name = String(rawName || "").trim().replace(/\s+/g, " ");
  const subject = String(rawSubject || "").trim().replace(/\s+/g, " ") || null;
  if (name.length < 2) return { ok: false, error: "Enter the teacher's full name." };

  // Campus comes from the caller's own profile unless they are org-wide, so a
  // coordinator cannot add faculty to another campus by editing the request.
  const targetCampus = ["owner", "management"].includes(profile.role) ? campusId : profile.campus_id;
  if (!targetCampus) return { ok: false, error: "No campus on your account." };

  const supabase = createClient();

  // Return the existing record rather than erroring: two coordinators adding
  // the same teacher at once should converge on one row, not see a failure.
  const { data: existing } = await supabase
    .from("faculty").select("id, name, subject").eq("campus_id", targetCampus);
  const clash = (existing || []).find(
    (f: { name: string; subject: string | null }) =>
      f.name.trim().toLowerCase() === name.toLowerCase() &&
      (f.subject || "").trim().toLowerCase() === (subject || "").toLowerCase()
  ) as { id: string; name: string; subject: string | null } | undefined;
  if (clash) return { ok: true, id: clash.id, name: clash.name, subject: clash.subject };

  const { data, error } = await supabase
    .from("faculty").insert({ campus_id: targetCampus, name, subject })
    .select("id, name, subject").single();

  if (error) {
    // Lost a race against the unique index — re-read and use the winner.
    const { data: again } = await supabase
      .from("faculty").select("id, name, subject").eq("campus_id", targetCampus);
    const found = (again || []).find(
      (f: { name: string; subject: string | null }) =>
        f.name.trim().toLowerCase() === name.toLowerCase() &&
        (f.subject || "").trim().toLowerCase() === (subject || "").toLowerCase()
    ) as { id: string; name: string; subject: string | null } | undefined;
    if (found) return { ok: true, id: found.id, name: found.name, subject: found.subject };
    return { ok: false, error: error.message };
  }

  await supabase.from("faculty_postings").insert({ faculty_id: data.id, campus_id: targetCampus });
  await supabase.from("faculty_audit").insert({
    faculty_id: data.id, action: "created",
    detail: { source: "verification form", subject },
    actor_id: user.id, actor_name: profile.name,
  });

  revalidatePath("/faculty");
  return { ok: true, id: data.id, name: data.name, subject: data.subject };
}

// ---------- LEADERSHIP: file a remark ----------
// Remarks are permanent. There is no edit or delete action anywhere in this
// file, and the database refuses both via trigger even for the service-role
// key — so nothing added later can quietly make them mutable.
export async function fileRemarkAction(_prev: unknown, formData: FormData) {
  const { profile, user } = await getProfile();
  if (!profile || !user) return { error: "Not authorised." };
  if (!["owner", "management", "principal"].includes(profile.role)) {
    return { error: "Only management and principals may file remarks." };
  }

  const facultyId = String(formData.get("facultyId") || "") || null;
  const coordinatorId = String(formData.get("coordinatorId") || "") || null;
  const reportId = String(formData.get("reportId") || "") || null;
  const kind = String(formData.get("kind") || "");
  const body = String(formData.get("body") || "").trim();
  const occurredOn = String(formData.get("occurredOn") || "") || new Date().toISOString().slice(0, 10);
  const subjectName = String(formData.get("subjectName") || "").trim();

  if (!["complaint", "appreciation", "observation"].includes(kind)) return { error: "Choose a remark type." };
  if (!body) return { error: "Write the remark before filing it." };
  if (!facultyId && !coordinatorId) return { error: "Missing who this remark is about." };
  if (facultyId && coordinatorId) return { error: "A remark is about one person only." };

  const supabase = createClient();

  // campus_id is taken from the subject record, never from the form, so a
  // principal cannot file outside their own campus by editing the request.
  let campusId: string | null = null;
  if (facultyId) {
    const { data: f } = await supabase.from("faculty").select("campus_id").eq("id", facultyId).single();
    if (!f) return { error: "Teacher not found." };
    campusId = f.campus_id;
  } else {
    const { data: p } = await supabase.from("profiles").select("campus_id").eq("id", coordinatorId).single();
    campusId = p?.campus_id ?? profile.campus_id;
  }
  if (profile.role === "principal" && campusId !== profile.campus_id) {
    return { error: "You can only file remarks for your own campus." };
  }

  const { error } = await supabase.from("remarks").insert({
    campus_id: campusId,
    target: facultyId ? "faculty" : "coordinator",
    faculty_id: facultyId,
    coordinator_id: coordinatorId,
    subject_name: subjectName || "—",
    report_id: reportId,
    kind, body,
    author_id: user.id,
    author_name: profile.name,
    author_role: profile.role,
    occurred_on: occurredOn,
  });
  if (error) return { error: error.message };

  if (facultyId) revalidatePath(`/faculty/${facultyId}`);
  if (reportId) revalidatePath(`/reports/${reportId}`);
  revalidatePath("/faculty");
  return { ok: "Remark filed. It is now a permanent part of this record." };
}

// ---------- LEADERSHIP: record that a remark was discussed with the teacher ----------
export async function acknowledgeRemarkAction(remarkId: string): Promise<{ ok: boolean; error?: string }> {
  const { profile, user } = await getProfile();
  if (!profile || !user) return { ok: false, error: "Not authorised." };
  if (!["owner", "management", "principal"].includes(profile.role)) {
    return { ok: false, error: "Not authorised." };
  }
  const supabase = createClient();
  const { data: rm } = await supabase.from("remarks").select("faculty_id").eq("id", remarkId).single();
  const { error } = await supabase.from("remark_acknowledgements").insert({
    remark_id: remarkId,
    discussed_by: user.id,
    discussed_by_name: profile.name,
  });
  if (error) return { ok: false, error: error.message };
  if (rm?.faculty_id) revalidatePath(`/faculty/${rm.faculty_id}`);
  return { ok: true };
}

// ---------- COORDINATOR: save a generated report ----------
export async function saveReportAction(report: {
  academic: { teacher: string; cls: string; subject: string; classBand?: string };
  facultyId?: string | null;
  samplingMethod?: string | null;
  date: string;
  students: { days?: number | null; obs?: string[] | null }[];
  recs: string[];
  finalObservation: string;
  principalSummary: string;
  engine: string;
}) {
  const { profile, user } = await getProfile();
  if (!profile || profile.role !== "coordinator" || !user) return { error: "Not authorised." };

  // Derived at write time. Recomputing these by expanding the students jsonb
  // across every report is fine at a dozen reports and unusable at ten campuses
  // times weekly verifications times three years.
  const days = report.students.map((s) => s.days).filter((d): d is number => typeof d === "number");
  const sorted = [...days].sort((a, b) => a - b);
  const medianDays = sorted.length
    ? (sorted.length % 2 ? sorted[sorted.length >> 1]
      : (sorted[(sorted.length >> 1) - 1] + sorted[sorted.length >> 1]) / 2)
    : null;
  const cqFlagCount = report.students.filter((s) => (s.obs || []).some(isTeacherFault)).length;
  const criticalCount = report.students.filter((s) =>
    (s.obs || []).some((o) => o === "CI.no_teacher_check" || o === "CI.long_gap")).length;

  const supabase = createClient();
  const { data, error } = await supabase.from("reports").insert({
    campus_id: profile.campus_id,
    coordinator_id: user.id,
    coordinator_name: profile.name,
    teacher: report.academic.teacher,
    faculty_id: report.facultyId || null,
    sampling_method: report.samplingMethod || null,
    class: report.academic.cls,
    subject: report.academic.subject,
    class_band: report.academic.classBand || null,
    date: report.date,
    sample_size: report.students.length,
    engine: report.engine,
    students: report.students,
    recs: report.recs,
    final_observation: report.finalObservation,
    principal_summary: report.principalSummary,
    median_days: medianDays,
    cq_flag_count: cqFlagCount,
    teacher_critical_count: criticalCount,
  }).select("id").single();

  if (error) return { error: error.message };
  revalidatePath("/reports");
  revalidatePath("/faculty");
  if (report.facultyId) revalidatePath(`/faculty/${report.facultyId}`);
  return { ok: true, id: data.id };
}

// ---------- OWNER: delete a stored report ----------
// Always returns the same shape so client-side handling is trivial and safe.
export async function deleteReportAction(reportId: string): Promise<{ ok: boolean; error?: string }> {
  const { profile, user } = await getProfile();
  if (profile?.role !== "owner") return { ok: false, error: "Only the owner can delete reports." };

  // SOFT delete. A verification is half of a teacher's accountability record,
  // so it is hidden from every list but never destroyed — otherwise the record
  // has an eraser, and a record with an eraser is worth little in a dispute.
  // Service-role client bypasses RLS; caller verified as owner above.
  const admin = adminClient();
  const { error } = await admin.from("reports")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
    .eq("id", reportId)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/faculty");
  return { ok: true };
}
