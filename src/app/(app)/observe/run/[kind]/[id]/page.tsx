import { redirect, notFound } from "next/navigation";
import { getProfile, createClient } from "@/lib/supabase/server";
import ObservationRunner from "@/components/ObservationRunner";
import type { RubricId } from "@/lib/observation-rubrics";

export const dynamic = "force-dynamic";

const KINDS: RubricId[] = ["in_campus", "demo"];

export default async function RunObservation({ params }: { params: { kind: string; id: string } }) {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");
  // Conducting an observation is the principal's alone. The owner may read the
  // finished report but never sit inside the running form.
  if (profile.role !== "principal") redirect("/observe");

  const kind = params.kind as RubricId;
  if (!KINDS.includes(kind)) notFound();

  const supabase = createClient();
  if (kind === "in_campus") {
    const { data } = await supabase.from("observations")
      .select("id, teacher_name, class_name, section, subject, topic, observed_on, status")
      .eq("id", params.id).single();
    if (!data) notFound();
    if (data.status === "submitted") redirect(`/observe/report/in_campus/${params.id}`);
    const where = [[data.class_name, data.section].filter(Boolean).join("-"), data.subject]
      .filter(Boolean).join(" · ");
    return (
      <ObservationRunner kind="in_campus" id={data.id}
        heading={data.teacher_name}
        subheading={[where, data.topic].filter(Boolean).join(" — ") || data.observed_on} />
    );
  }

  const { data } = await supabase.from("demo_observations")
    .select("id, candidate_name, subject, demo_class, observed_on, status")
    .eq("id", params.id).single();
  if (!data) notFound();
  if (data.status === "submitted") redirect(`/observe/report/demo/${params.id}`);
  return (
    <ObservationRunner kind="demo" id={data.id}
      heading={data.candidate_name}
      subheading={["Demo class", data.subject, data.demo_class].filter(Boolean).join(" · ")} />
  );
}
