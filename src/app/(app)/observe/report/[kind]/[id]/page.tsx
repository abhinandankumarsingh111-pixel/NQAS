import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getProfile, createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/PrintButton";
import AmendForm from "@/components/AmendForm";
import ObservationControls from "@/components/ObservationControls";
import {
  RUBRICS, FOLLOW_UP_LABEL, RECOMMENDATION_LABEL, PLAN_LABEL, PLAN_LEAD,
  rubricTotal, type RubricId,
} from "@/lib/observation-rubrics";
import {
  scoreRows, GRADE_COLOR, developmentPlan, strengthsList, normalisePlan, planToText,
  concernCriteria, criterionName, type Answers,
} from "@/lib/observation-scoring";

export const dynamic = "force-dynamic";

const KINDS: RubricId[] = ["in_campus", "demo"];

export default async function ObservationReport({ params }: { params: { kind: string; id: string } }) {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");
  // Management can reach a report only where the principal shared it — RLS
  // returns nothing otherwise, and the notFound() below catches that.
  if (!["principal", "owner", "management"].includes(profile.role)) redirect("/dashboard");

  const kind = params.kind as RubricId;
  if (!KINDS.includes(kind)) notFound();
  const rubric = RUBRICS[kind];
  const supabase = createClient();

  const { data: o } = await supabase
    .from(kind === "in_campus" ? "observations" : "demo_observations")
    .select("*").eq("id", params.id).single();
  if (!o) notFound();

  const [{ data: campus }, { data: amendments }] = await Promise.all([
    supabase.from("campuses").select("name").eq("id", o.campus_id).single(),
    supabase.from("observation_amendments").select("*")
      .eq("observation_id", params.id).order("changed_at", { ascending: false }),
  ]);

  // Earlier observations of the SAME teacher, for two things a principal cannot
  // hold in their head: whether a concern is being raised again, and whether
  // the teacher is moving.
  const { data: history } = kind === "in_campus" && o.faculty_id
    ? await supabase.from("observations")
        .select("id, observed_on, pct, grade, answers")
        .eq("faculty_id", o.faculty_id).eq("status", "submitted")
        .lt("observed_on", o.observed_on)
        .order("observed_on", { ascending: false }).limit(5)
    : { data: null };
  const past = history || [];

  const answers = (o.answers || {}) as Answers;
  const rows = scoreRows(rubric, answers);
  const keep = strengthsList(rubric, answers);

  // What the principal actually composed. Records filed before the composer
  // existed carry none, so those fall back to the derived plan — which is what
  // was shown at the time, so nothing shifts under a reader who saw it before.
  const filed = normalisePlan(o.plan);
  const derived = filed.length ? [] : developmentPlan(rubric, answers);
  const hasPlan = filed.length > 0 || derived.length > 0;

  // A weakness flagged three times running is a different conversation from one
  // flagged once, and the system should be the thing that remembers.
  const nowConcerns = new Set(concernCriteria(rubric, answers));
  const repeats = past.length
    ? [...nowConcerns].filter((cid) =>
        concernCriteria(rubric, (past[0].answers || {}) as Answers).includes(cid))
    : [];

  const isDemo = kind === "demo";
  const who = isDemo ? o.candidate_name : o.teacher_name;
  const grade = o.grade || "C";
  // Only the campus principal may correct a submitted record; the owner reads.
  const canAmend = profile.role === "principal" && o.status === "submitted";
  // A record filed before the rubric was reweighted keeps its own totals. Say so
  // rather than let a reader compare it against today's marks and conclude the
  // arithmetic is broken.
  const olderRubric = o.status === "submitted"
    && typeof o.max_marks === "number" && o.max_marks !== rubricTotal(rubric);

  const meta: [string, string][] = [
    ["Type", isDemo ? "Demo Class Observation" : "In-Campus Class Observation"],
    ["Campus", campus?.name || "—"],
    [isDemo ? "Candidate" : "Teacher", who],
    ...(isDemo
      ? ([["Demo class", o.demo_class || "—"], ["Subject", o.subject || "—"]] as [string, string][])
      : ([
          ["Class", [o.class_name, o.section].filter(Boolean).join("-") || "—"],
          ["Subject", o.subject || "—"],
          ["Topic", o.topic || "—"],
        ] as [string, string][])),
    ["Date", o.observed_on],
    ["Time", (o.observed_at || "").slice(0, 5) || "—"],
    ["Observer", o.observer_name],
  ];

  return (
    <div className="obs">
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <Link href="/observe" className="muted" style={{ fontSize: 13 }}>&larr; Class Observation</Link>
        <PrintButton />
      </div>

      {o.status === "draft" && (
        <div className="obs-warn" style={{ marginBottom: 12 }}>
          This observation has not been submitted yet.{" "}
          <Link href={`/observe/run/${kind}/${o.id}`}>Continue it</Link>.
        </div>
      )}

      <div className="report report-print">
        <div className="report-hd" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo-symbol.png" alt="" width={38} height={38}
            style={{ flexShrink: 0, borderRadius: "50%", background: "#fff", padding: 2, border: "1.5px solid var(--gold-soft)" }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-ui)" }}>
              Krishna Vikash Group of CBSE Schools
            </div>
            <div style={{ fontSize: 12, color: "var(--gold-soft)" }}>{campus?.name}</div>
          </div>
        </div>

        <div className="report-body">
          <h1>{isDemo ? "Demo Class Observation Report" : "Class Observation Report"}</h1>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px", fontSize: 13, marginBottom: 14 }}>
            {meta.map(([k, v]) => <div key={k}><b>{k}:</b> {v}</div>)}
          </div>

          {olderRubric && (
            <div className="obs-warn" style={{ marginBottom: 12 }}>
              Scored when this rubric was worth {o.max_marks} marks; it is now worth{" "}
              {rubricTotal(rubric)}. The scores below are exactly as recorded on the day,
              and the percentage is calculated against the marks that applied then.
            </div>
          )}

          <div className="obs-total" style={{ borderColor: GRADE_COLOR[grade], marginBottom: 16 }}>
            <div>
              <span>Total</span>
              <b>{o.earned} <i>/ {o.max_marks}</i></b>
            </div>
            <div className="obs-grade" style={{ background: GRADE_COLOR[grade] }}>
              {grade} · {o.pct}%
            </div>
          </div>

          <div className="scroll-x">
            <table className="rt">
              <thead><tr>
                <th style={{ textAlign: "left" }}>Criterion</th>
                <th style={{ textAlign: "left" }}>What was observed</th>
                <th>Score</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? "#fafaf7" : "#fff" }}>
                    <td>
                      {r.name}
                      {r.retired && (
                        <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 2 }}>
                          scored under the earlier rubric &middot; no longer asked
                        </div>
                      )}
                      {r.edited && (
                        <div style={{ fontSize: 10.5, color: "var(--orange)", fontWeight: 700, marginTop: 2 }}>
                          principal&rsquo;s score &middot; system suggested {r.auto}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {r.chosen.join(", ") || "—"}
                      {r.remark && (
                        <div style={{ marginTop: 3, fontStyle: "italic", color: "var(--sub)" }}>
                          &ldquo;{r.remark}&rdquo;
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {r.score ?? "—"} / {r.max}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {past.length > 0 && (
            <>
              <h3>Trend</h3>
              <div className="obs-trend">
                {[...past].reverse().map((h) => (
                  <span key={h.id} className="obs-trend-pill">
                    {String(h.observed_on).slice(5)} &middot; {h.pct}% {h.grade}
                  </span>
                ))}
                <span className="obs-trend-pill now">
                  {String(o.observed_on).slice(5)} &middot; {o.pct}% {grade}
                </span>
              </div>
            </>
          )}

          {repeats.length > 0 && (
            <div className="obs-repeat">
              <b>Raised again.</b> {repeats.map((c) => criterionName(rubric, c)).join(", ")}
              {repeats.length === 1 ? " was" : " were"} also flagged at the previous
              observation on {String(past[0].observed_on)}. Where a concern persists
              across observations, support is more use than another note.
            </div>
          )}

          {keep.length > 0 && (
            <>
              <h3>Strengths &mdash; keep doing</h3>
              <ul style={{ margin: "0 0 13px", paddingLeft: 20 }}>
                {keep.map((k) => <li key={k} style={{ marginBottom: 3 }}>{k}</li>)}
              </ul>
            </>
          )}

          {hasPlan && (
            <>
              <h3>{PLAN_LABEL[kind]}</h3>
              <p className="muted" style={{ fontSize: 12, margin: "0 0 9px" }}>
                {filed.length
                  ? `${PLAN_LEAD[kind]} In the order the observer set.`
                  : `${PLAN_LEAD[kind]} Most important first, by the marks each cost.`}
              </p>
              <ol style={{ margin: "0 0 13px", paddingLeft: 20 }}>
                {filed.length
                  ? filed.map((a) => (
                      <li key={a.text} style={{ marginBottom: 8 }}>
                        {a.text.charAt(0).toUpperCase() + a.text.slice(1)}.
                        {(a.criterion || a.source === "written") && (
                          <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 2 }}>
                            {a.source === "written"
                              ? `${isDemo ? "Panel" : "Observer"}’s own note`
                              : a.criterion}
                          </div>
                        )}
                      </li>
                    ))
                  : derived.map((a) => (
                      <li key={a.action} style={{ marginBottom: 8 }}>
                        {a.action.charAt(0).toUpperCase() + a.action.slice(1)}.
                        <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 2 }}>
                          {a.criterion} &middot; {a.lost} of {a.max} marks &middot; {a.observed.join(", ").toLowerCase()}
                        </div>
                      </li>
                    ))}
              </ol>
            </>
          )}

          {o.improvements && !hasPlan && (
            <><h3>Areas for Improvement</h3><p style={{ margin: "0 0 13px" }}>{o.improvements}</p></>
          )}

          {o.final_remark && (
            <><h3>{isDemo ? "Principal's Remarks" : "Principal's Final Remarks"}</h3>
            <p style={{ margin: "0 0 13px", whiteSpace: "pre-wrap" }}>{o.final_remark}</p></>
          )}

          <h3>{isDemo ? "Recommendation" : "Follow-up"}</h3>
          <p style={{ margin: 0, fontWeight: 700, color: "var(--navy)" }}>
            {isDemo
              ? RECOMMENDATION_LABEL[o.recommendation || "consider"]
              : FOLLOW_UP_LABEL[o.follow_up || "none"]}
          </p>

          <div style={{ marginTop: 18, fontSize: 12, color: "var(--sub)", borderTop: "1px solid var(--line)", paddingTop: 7 }}>
            {o.status === "submitted"
              ? `Submitted ${new Date(o.submitted_at).toLocaleString("en-GB")} by ${o.observer_name} — locked record.`
              : "Draft — not yet part of the record."}
            {o.status === "submitted" && (
              <span className={`obs-shared-chip ${o.visible_to_management ? "obs-shared-yes" : "obs-shared-no"}`}
                style={{ marginLeft: 8 }}>
                {o.visible_to_management ? "Shared with management" : "Private to the principal"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Spec 35: the original is never silently overwritten. */}
      {(amendments || []).length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-h"><h2>Amendment history</h2></div>
          {(amendments || []).map((a) => (
            <div key={a.id} className="tl tl-remark" style={{ marginBottom: 8 }}>
              <div className="tl-date">{new Date(a.changed_at).toLocaleDateString("en-GB")}</div>
              <div className="tl-body">
                <b>{a.field.replace(/_/g, " ")}</b>
                <span className="muted" style={{ fontSize: 12 }}> — {a.changed_by_name}</span>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  <div style={{ color: "var(--sub)", textDecoration: "line-through", whiteSpace: "pre-wrap" }}>{a.old_value || "(empty)"}</div>
                  <div style={{ color: "var(--navy)", whiteSpace: "pre-wrap" }}>{a.new_value || "(empty)"}</div>
                </div>
                {a.reason && (
                  <div style={{ fontSize: 12, marginTop: 4, fontStyle: "italic", color: "var(--sub)" }}>
                    Reason: {a.reason}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {o.status === "submitted" && (
        <ObservationControls
          kind={kind} id={o.id} who={who}
          isPrincipal={profile.role === "principal"}
          isOwner={profile.role === "owner"}
          shared={o.visible_to_management === true}
        />
      )}

      {canAmend && (
        <AmendForm kind={kind} id={o.id} isDemo={isDemo}
          current={{
            final_remark: o.final_remark || "",
            follow_up: o.follow_up || "none",
            recommendation: o.recommendation || "consider",
            strengths: o.strengths || "",
            improvements: o.improvements || "",
            plan: planToText(filed),
          }} />
      )}
    </div>
  );
}
