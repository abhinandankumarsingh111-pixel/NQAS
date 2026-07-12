import { redirect } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/supabase/server";

// Entry point: decide where the visitor should go.
export default async function Home() {
  const { user } = await getProfile();
  if (user) redirect("/dashboard");

  // No owner yet -> first-run setup. Otherwise -> login.
  const admin = adminClient();
  const { data } = await admin.from("profiles").select("id").eq("role", "owner").limit(1);
  if (!data || data.length === 0) redirect("/setup");
  redirect("/login");
}
