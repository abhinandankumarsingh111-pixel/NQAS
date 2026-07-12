import { redirect } from "next/navigation";
import { getProfile, createClient } from "@/lib/supabase/server";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  const { user, profile } = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "owner") redirect("/dashboard");

  const supabase = createClient();
  const [{ data: campuses }, { data: users }] = await Promise.all([
    supabase.from("campuses").select("*").order("name"),
    supabase.from("profiles").select("id, name, role, login_id, campus_id").order("created_at"),
  ]);

  return <AdminClient campuses={campuses || []} users={users || []} myId={user!.id} />;
}
