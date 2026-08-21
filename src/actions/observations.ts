"use server";

import { createClient, getProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { RUBRICS, type RubricId, rubricTotal } from "@/lib/observation-rubrics";
import {
  type Answers, totalsFor, summarise, suggestedScore,
} from "@/lib/observation-scoring";

// ============================================================
// CLASS OBSERVATION — server actions.
//
// PRINCIPAL ONLY for anything that writes. Management and coordinators are
// refused here and again by RLS in the database, so neither layer is
// load-bearing on its own. The owner may read observations and delete one, but
// never conduct or amend: an observation is a professional judgement made in a
// room the owner was not standing in.
// ============================================================

type Kind = RubricId;

async function requirePrincipal() {
  const { profile, user } = await getProfile();
  if (!profile || !user) return { error: "Not authorised." as const };
  if (profile.role !== "principal") {
    return { error: "Class Observation is available to principals only." as const };
  }
  if (!profile.campus_id) return { error: "Your account is not linked to a campus." as const };
  return { profile, user };
}

const TABLE: Record<Kind, string> = {
  in_campus: "observations",
  demo: "demo_observations",
};

/**
 * Re-derive every score from the stored taps rather than trusting what the
 * browser sent.
 *
 * The principal may legitimately override any score, so an edited value must be
 * accepted — but only within the criterion's range. This keeps a tampered or
 * simply buggy client from writing 400/15 into a permanent personnel record,
 * while leaving genuine professional judgement completely free.
 */
function sanitise(kind: Kind, raw: unknown): Answers {
  const rubric = RUBRICS[kind];
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const clean: Answers = {};

  for (const c of rubric.criteria) {
    const a = input[c.id] as { selected?: unknown; score?: unknown; remark?: unknown } | undefined;
    if (!a || typeof a !== "object") continue;

    const validIds = new Set(c.options.map((o) => o.id));
    let selected = Array.isArray(a.selected)
      ? a.selected.filter((x): x is string => typeof x === "string" && validIds.has(x))
      : [];
    // A scale is one answer. If several arrive, the last tap wins.
    if (c.mode === "scale" && selected.length > 1) selected = [selected[selected.length - 1]];
    if (selected.length === 0) continue;

    const auto = suggestedScore(c, selected);
    const asked = typeof a.score === "number" ? Math.round(a.score) : auto;
    const score = Math.max(0, Math.min(c.max, Number.isFinite(asked) ? asked : auto));
    const remark = typeof a.remark === "string" ? a.remark.trim().slice(0, 600) : undefined;

    // Stamp the criterion's current worth onto the answer so this record still
    // reads correctly after the rubric is reweighted.
    clean[c.id] = { selected, auto, score, max: c.max, ...(remark ? { remark } : {}) };
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Starting an observation. Creates a DRAFT immediately, so that everything
// entered from the first tap onward is already saved on the server — the
// principal is standing in a classroom holding a phone, and a dropped
// connection or an incoming call must never cost them the observation.
// ---------------------------------------------------------------------------
export async function startInCampusAction(input: {
  facultyId: string | null; teacherName: string;
  className: string; section: string; subject: string; topic: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const auth = await requirePrincipal();
  if ("error" in auth) return { ok: false, error: auth.error };

  const teacher = input.teacherName.trim();
  if (!teacher) return { ok: false, error: "Choose the teacher you are observing." };

  const supabase = createClient();
  const now = new Date();
  const { data, error } = await supabase.from("observations").insert({
    campus_id: auth.profile.campus_id,
    faculty_id: input.facultyId,
    teacher_name: teacher,
    observer_id: auth.user.id,
    observer_name: auth.profile.name,
    class_name: input.className.trim() || null,
    section: input.section.trim() || null,
    subject: input.subject.trim() || null,
    topic: input.topic.trim() || null,
    observed_on: now.toISOString().slice(0, 10),
    observed_at: now.toTimeString().slice(0, 8),
    max_marks: rubricTotal(RUBRICS.in_campus),
  }).select("id").single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/observe");
  return { ok: true, id: data.id };
}

export async function startDemoAction(input: {
  candidateName: string; subject: string; demoClass: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const auth = await requirePrincipal();
  if ("error" in auth) return { ok: false, error: auth.error };

  const candidate = input.candidateName.trim();
  if (!candidate) return { ok: false, error: "Enter the candidate's name." };

  const supabase = createClient();
  const now = new Date();
  const { data, error } = await supabase.from("demo_observations").insert({
    campus_id: auth.profile.campus_id,
    candidate_name: candidate,
    subject: input.subject.trim() || null,
    demo_class: input.demoClass.trim() || null,
    observer_id: auth.user.id,
    observer_name: auth.profile.name,
    observed_on: now.toISOString().slice(0, 10),
    observed_at: now.toTimeString().slice(0, 8),
    max_marks: rubricTotal(RUBRICS.demo),
  }).select("id").single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/observe");
  return { ok: true, id: data.id };
}

// ---------------------------------------------------------------------------
// Autosave. Called after every criterion. Deliberately cheap and silent:
// it must never interrupt, and it must never block the Next button.
// ---------------------------------------------------------------------------
export async function saveProgressAction(
  kind: Kind, id: string, answers: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requirePrincipal();
  if ("error" in auth) return { ok: false, error: auth.error };

  const clean = sanitise(kind, answers);
  const t = totalsFor(RUBRICS[kind], clean);

  const supabase = createClient();
  const { error } = await supabase.from(TABLE[kind])
    .update({ answers: clean, earned: t.earned, max_marks: t.max, pct: t.pct, grade: t.grade })
    .eq("id", id)
    .eq("campus_id", auth.profile.campus_id)
    .eq("status", "draft");

  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------------------------------------------------------------------------
// Submission. Totals and the written summary are composed HERE, from the
// stored taps, so the record is the system's own arithmetic rather than
// whatever the browser last calculated.
// ---------------------------------------------------------------------------
export async function submitObservationAction(
  kind: Kind, id: string,
  extra: {
    answers: unknown; finalRemark?: string; followUp?: string;
    recommendation?: string; visibleToManagement?: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requirePrincipal();
  if ("error" in auth) return { ok: false, error: auth.error };

  const rubric = RUBRICS[kind];
  const clean = sanitise(kind, extra.answers);
  const t = totalsFor(rubric, clean);

  if (t.unanswered.length) {
    const names = rubric.criteria.filter((c) => t.unanswered.includes(c.id)).map((c) => c.name);
    return { ok: false, error: `Still to answer: ${names.join(", ")}.` };
  }

  const s = summarise(rubric, clean);
  const supabase = createClient();

  const row: Record<string, unknown> = {
    answers: clean,
    earned: t.earned, max_marks: t.max, pct: t.pct, grade: t.grade,
    strengths: s.strengths || null,
    improvements: s.improvements || null,
    final_remark: extra.finalRemark?.trim() || null,
    status: "submitted",
    submitted_at: new Date().toISOString(),
    // Private to the principal unless they say otherwise. An observation is a
    // candid judgement written in the moment; if every one were visible upward
    // by default, principals would start writing for the audience rather than
    // for the teacher, and the record would quietly become useless.
    visible_to_management: extra.visibleToManagement === true,
  };
  if (kind === "in_campus") row.follow_up = extra.followUp || "none";
  else row.recommendation = extra.recommendation || "consider";

  const { error } = await supabase.from(TABLE[kind])
    .update(row).eq("id", id)
    .eq("campus_id", auth.profile.campus_id)
    .eq("status", "draft");

  if (error) return { ok: false, error: error.message };
  revalidatePath("/observe");
  revalidatePath(`/observe/report/${kind}/${id}`);
  return { ok: true };
}

/** Abandon a draft. Only ever a draft — a submitted record cannot be deleted. */
export async function discardDraftAction(kind: Kind, id: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requirePrincipal();
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = createClient();
  const { error } = await supabase.from(TABLE[kind]).delete()
    .eq("id", id).eq("campus_id", auth.profile.campus_id).eq("status", "draft");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/observe");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Amendment (spec 34-35). The database refuses a direct write to a submitted
// row; this routes through amend_observation(), which records the before and
// after in the same transaction. The original is never silently overwritten.
// ---------------------------------------------------------------------------
const AMENDABLE = new Set([
  "final_remark", "follow_up", "recommendation", "strengths", "improvements",
  // Sharing is a property of the record rather than of its content, so it can
  // be turned on or off afterwards — and every flip is logged like any other
  // amendment, because who could see what, and from when, is exactly the kind
  // of question that gets asked a year later.
  "visible_to_management",
]);

export async function amendObservationAction(
  kind: Kind, id: string, field: string, value: string, reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requirePrincipal();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!AMENDABLE.has(field)) return { ok: false, error: "That part of the record cannot be amended." };
  if (!reason.trim()) return { ok: false, error: "Give a reason — it is recorded with the change." };

  const supabase = createClient();
  const { error } = await supabase.rpc("amend_observation", {
    p_id: id, p_kind: kind, p_field: field,
    p_new_value: value.trim() || null, p_reason: reason.trim(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/observe/report/${kind}/${id}`);
  return { ok: true };
}

/**
 * Share a submitted observation with management, or stop sharing it.
 *
 * Goes through the amendment door like everything else, so the log records who
 * shared what and when. Management sees only what is shared AND submitted:
 * a draft is work in progress, not a finding.
 */
export async function setVisibilityAction(
  kind: Kind, id: string, visible: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requirePrincipal();
  if ("error" in auth) return { ok: false, error: auth.error };

  const supabase = createClient();
  const { error } = await supabase.rpc("amend_observation", {
    p_id: id, p_kind: kind, p_field: "visible_to_management",
    p_new_value: visible ? "true" : "false",
    p_reason: visible ? "Shared with management" : "Sharing with management withdrawn",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/observe/report/${kind}/${id}`);
  revalidatePath("/observe");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// OWNER DELETE.
//
// A submitted observation is locked against the principal who wrote it, which
// is right: nobody should be able to quietly remove a judgement they later
// regret. But a mistaken or duplicate record has to be removable by someone,
// and that is the owner.
//
// The database refuses a direct delete and yields only to delete_observation(),
// which writes a summary of what it destroyed — teacher, date, score, reason —
// before removing the row. That audit row outlives the record, so a deletion
// can never be invisible.
// ---------------------------------------------------------------------------
export async function deleteObservationAction(
  kind: Kind, id: string, reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const { profile } = await getProfile();
  if (!profile) return { ok: false, error: "Not authorised." };
  if (profile.role !== "owner") {
    return { ok: false, error: "Only the owner can delete an observation." };
  }
  if (!reason.trim()) {
    return { ok: false, error: "Give a reason — it is kept after the record is gone." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("delete_observation", {
    p_id: id, p_kind: kind, p_reason: reason.trim(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/observe");
  return { ok: true };
}
