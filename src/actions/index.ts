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

// ---------- OWNER: create a management/coordinator ID ----------
export async function createUserAction(_prev: unknown, formData: FormData) {
  const { profile } = await getProfile();
  if (profile?.role !== "owner") return { error: "Not authorised." };

  const name = String(formData.get("name") || "").trim();
  const id = String(formData.get("loginId") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "coordinator");
  const password = String(formData.get("password") || "");
  const campus_id = String(formData.get("campusId") || "") || null;

  if (!name || !id) return { error: "Name and login ID are required." };
  if (password.length < 6) return { error: "Password must be at least 6 characters." };
  if (role === "coordinator" && !campus_id) return { error: "Choose a campus for the coordinator." };

  const admin = adminClient();
  const { error } = await admin.auth.admin.createUser({
    email: idToEmail(id),
    password,
    email_confirm: true,
    user_metadata: { name, role, login_id: id, campus_id: role === "coordinator" ? campus_id : "" },
  });
  if (error) return { error: error.message.includes("already") ? "That login ID already exists." : error.message };

  revalidatePath("/admin");
  return { ok: `Created ${role} ID "${id}". Share the ID and password with them.` };
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
  if (!name) return { error: "Enter a campus name." };
  const supabase = createClient();
  const { error } = await supabase.from("campuses").insert({ name });
  if (error) return { error: error.message.includes("duplicate") ? "That campus already exists." : error.message };
  revalidatePath("/admin");
  return { ok: `Added campus "${name}".` };
}

// ---------- COORDINATOR: save a generated report ----------
export async function saveReportAction(report: {
  academic: { teacher: string; cls: string; subject: string };
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
