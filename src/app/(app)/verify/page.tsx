import { redirect } from "next/navigation";
import { getProfile, createClient } from "@/lib/supabase/server";
import VerifyClient from "./VerifyClient";

export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coordinator") redirect("/dashboard");

  const supabase = createClient();
  const [{ data: campus }, { data: faculty }] = await Promise.all([
    supabase.from("campuses").select("name").eq("id", profile.campus_id).single(),
    // RLS already scopes this to the coordinator's campus; the filter is
    // belt-and-braces so a policy change can never widen the picker silently.
    supabase.from("faculty").select("id, name, subject")
      .eq("campus_id", profile.campus_id).eq("active", true).order("name"),
  ]);

  return (
    <div>
      <div className="muted" style={{ marginBottom: 12 }}>
        Campus: <b style={{ color: "var(--teal)" }}>{campus?.name || "—"}</b> — your access is limited to this campus.
      </div>
      <VerifyClient
        campusName={campus?.name || "—"}
        coordinatorName={profile.name}
        campusId={profile.campus_id || ""}
        faculty={faculty || []}
      />
    </div>
  );
}
