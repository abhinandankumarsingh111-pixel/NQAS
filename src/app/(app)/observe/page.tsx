import { redirect } from "next/navigation";
import Link from "next/link";
import { getProfile, createClient } from "@/lib/supabase/server";
import { GRADE_COLOR } from "@/lib/observation-scoring";
import { FOLLOW_UP_LABEL, RECOMMENDATION_LABEL } from "@/lib/observation-rubrics";

export const dynamic = "force-dynamic";

/**
 * Class Observation — the principal's panel.
 *
 * Two modules, deliberately kept apart at every level: separate rubrics,
 * separate tables, separate histories, separate reports. This page is the only
 * place they appear side by side, and even here they are two distinct doors.
 */
export default async function ObservePanel() {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");

  const isPrincipal = profile.role === "principal";
  const isOwner = profile.role === "owner";
  const isManagement = profile.role === "management";
  // Conducting an observation stays the principal's alone. Management reads
  // only what a principal has chosen to share, which RLS enforces — nothing
  // else comes back for them, so the lists below are already filtered.
  // Coordinators have no business here at all.
  if (!isPrincipal && !isOwner && !isManagement) redirect("/dashboard");

  const supabase = createClient();
  const [{ data: obs }, { data: demos }] = await Promise.all([
    supabase.from("observations")
      .select("id, teacher_name, class_name, section, subject, observed_on, earned, max_marks, pct, grade, status, follow_up, visible_to_management")
      .order("observed_on", { ascending: false }).limit(25),
    supabase.from("demo_observations")
      .select("id, candidate_name, subject, demo_class, observed_on, earned, max_marks, pct, grade, status, recommendation, visible_to_management")
      .order("observed_on", { ascending: false }).limit(25),
  ]);

  const all = obs || [];
  const allDemo = demos || [];
  const draft = all.find((o) => o.status === "draft");
  const draftDemo = allDemo.find((o) => o.status === "draft");
  const doneObs = all.filter((o) => o.status === "submitted");
  const doneDemo = allDemo.filter((o) => o.status === "submitted");

  return (
    <div className="obs">
      <div className="card-h" style={{ marginBottom: 14 }}>
        <h2>Class Observation</h2>
      </div>

      {isOwner && (
        <div className="notice" style={{ marginTop: 0 }}>
          <b>Viewing as owner.</b> You can read every campus&rsquo;s observations here,
          shared or not, and remove one if it was filed in error. Conducting one is
          the principal&rsquo;s alone &mdash; they were in the room.
        </div>
      )}

      {isManagement && (
        <div className="notice" style={{ marginTop: 0 }}>
          <b>Shared observations only.</b> Principals decide which of their
          observations to share upward. Anything not listed here has not been
          shared &mdash; that is deliberate, so an observation can be written
          candidly for the teacher rather than for an audience.
        </div>
      )}

      {/* An interrupted observation is the normal case on a phone, not the
          exception, so resuming is the first thing on the screen. */}
      {isPrincipal && draft && (
        <div className="obs-resume">
          <div>
            <b>{draft.teacher_name}</b>
            Unfinished in-campus observation from {draft.observed_on}
          </div>
          <Link href={`/observe/run/in_campus/${draft.id}`}>Resume</Link>
        </div>
      )}
      {isPrincipal && draftDemo && (
        <div className="obs-resume">
          <div>
            <b>{draftDemo.candidate_name}</b>
            Unfinished demo observation from {draftDemo.observed_on}
          </div>
          <Link href={`/observe/run/demo/${draftDemo.id}`}>Resume</Link>
        </div>
      )}

      {isPrincipal && (
        <div className="obs-pick">
          <Link href="/observe/start/in-campus" className="obs-tile obs-tile-campus">
            <b>In-Campus Observation</b>
            <span>A teacher on this campus, during a regular lesson. Becomes part of their permanent record.</span>
          </Link>
          <Link href="/observe/start/demo" className="obs-tile obs-tile-demo">
            <b>Demo Class Observation</b>
            <span>A candidate giving a demonstration lesson. Kept in the hiring file, never in a teacher&rsquo;s record.</span>
          </Link>
        </div>
      )}

      <h3 style={{ fontSize: 14, color: "var(--navy)", margin: "20px 0 9px" }}>
        In-Campus &mdash; recent
      </h3>
      {doneObs.length === 0 ? (
        <div className="muted" style={{ fontSize: 13.5 }}>
          {isManagement ? "No observations have been shared with you yet." : "No observations recorded yet."}
        </div>
      ) : (
        <div className="obs-hist">
          {doneObs.map((o) => (
            <Link key={o.id} href={`/observe/report/in_campus/${o.id}`} className="obs-hrow">
              <span className="obs-hgrade" style={{ background: GRADE_COLOR[o.grade || "C"] }}>{o.grade}</span>
              <span className="obs-hmain">
                <b>{o.teacher_name}</b>
                <span>
                  {[o.class_name, o.section].filter(Boolean).join("-") || "—"}
                  {o.subject ? ` · ${o.subject}` : ""} · {o.observed_on}
                  {o.follow_up && o.follow_up !== "none" ? ` · ${FOLLOW_UP_LABEL[o.follow_up]}` : ""}
                  {isPrincipal && o.visible_to_management ? " · shared" : ""}
                </span>
              </span>
              <span className="obs-hscore">{o.earned}/{o.max_marks}</span>
            </Link>
          ))}
        </div>
      )}

      <h3 style={{ fontSize: 14, color: "var(--navy)", margin: "22px 0 9px" }}>
        Demo Classes &mdash; recent
      </h3>
      {doneDemo.length === 0 ? (
        <div className="muted" style={{ fontSize: 13.5 }}>
          {isManagement ? "No demo observations have been shared with you yet." : "No demo observations recorded yet."}
        </div>
      ) : (
        <div className="obs-hist">
          {doneDemo.map((o) => (
            <Link key={o.id} href={`/observe/report/demo/${o.id}`} className="obs-hrow">
              <span className="obs-hgrade" style={{ background: GRADE_COLOR[o.grade || "C"] }}>{o.grade}</span>
              <span className="obs-hmain">
                <b>{o.candidate_name}</b>
                <span>
                  {o.subject || "—"}{o.demo_class ? ` · ${o.demo_class}` : ""} · {o.observed_on}
                  {o.recommendation ? ` · ${RECOMMENDATION_LABEL[o.recommendation]}` : ""}
                  {isPrincipal && o.visible_to_management ? " · shared" : ""}
                </span>
              </span>
              <span className="obs-hscore">{o.earned}/{o.max_marks}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
