import { redirect } from "next/navigation";
import { getProfile, createClient } from "@/lib/supabase/server";
import VerifyClient from "./VerifyClient";

export default async function VerifyPage() {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coordinator") redirect("/dashboard");

  const supabase = createClient();
  const { data: campus } = await supabase.from("campuses").select("name").eq("id", profile.campus_id).single();

  return (
    <div>
      <div className="muted" style={{ marginBottom: 12 }}>
        Campus: <b style={{ color: "var(--teal)" }}>{campus?.name || "—"}</b> — your access is limited to this campus.
      </div>
      <VerifyClient campusName={campus?.name || "—"} coordinatorName={profile.name} />
    </div>
  );
}
