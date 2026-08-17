"use server";

import { createClient, getProfile } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
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

// ---------- OWNER: edit an existing account's role and/or campus ----------
// Used to promote/demote (e.g. Coordinator -> Principal) without deleting
// and recreating the account. Writes directly to the profiles table, since
// RLS policies read role/campus from there, not from auth metadata.
export async function updateUserAction(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; ok?: string }> {
  const { profile, user } = await getProfile();
  if (profile?.role !== "owner") return { error: "Not authorised." };

  const targetId = String(formData.get("userId") || "");
  const role = String(formData.get("role") || "");
  const campus_id = String(formData.get("campusId") || "") || null;

  if (!targetId) return { error: "Missing account." };
  if (targetId === user?.id) return { error: "You cannot edit your own account here." };
  if (!["coordinator", "principal", "management"].includes(role)) return { error: "Invalid role." };

  const needsCampus = role === "coordinator" || role === "principal";
  if (needsCampus && !campus_id) return { error: "Choose a campus for this role." };

  const admin = adminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role, campus_id: needsCampus ? campus_id : null })
    .eq("id", targetId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: "Account updated." };
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

// ---------- COORDINATOR: save a generated report ----------
export async function saveReportAction(report: {
  academic: { teacher: string; cls: string; subject: string; classBand?: string };
  date: string;
  students: unknown[];
  recs: string[];
  finalObservation: string;
  principalSummary: string;
  engine: string;
}) {
  const { profile, user } = await getProfile();
  if (!profile || profile.role !== "coordinator" || !user) return { error: "Not authorised." };

  const supabase = createClient();
  const { data, error } = await supabase.from("reports").insert({
    campus_id: profile.campus_id,
    coordinator_id: user.id,
    coordinator_name: profile.name,
    teacher: report.academic.teacher,
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
  }).select("id").single();

  if (error) return { error: error.message };
  revalidatePath("/reports");
  return { ok: true, id: data.id };
}

// ---------- OWNER: delete a stored report ----------
// Always returns the same shape so client-side handling is trivial and safe.
export async function deleteReportAction(reportId: string): Promise<{ ok: boolean; error?: string }> {
  const { profile } = await getProfile();
  if (profile?.role !== "owner") return { ok: false, error: "Only the owner can delete reports." };
  // Service-role client bypasses RLS; caller verified as owner above.
  const admin = adminClient();
  const { error } = await admin.from("reports").delete().eq("id", reportId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  return { ok: true };
}
