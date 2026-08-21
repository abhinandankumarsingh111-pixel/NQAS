import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getProfile, createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/PrintButton";
import AmendForm from "@/components/AmendForm";
import {
  RUBRICS, FOLLOW_UP_LABEL, RECOMMENDATION_LABEL, rubricTotal, type RubricId,
} from "@/lib/observation-rubrics";
import { scoreRows, GRADE_COLOR, type Answers } from "@/lib/observation-scoring";

export const dynamic = "force-dynamic";

const KINDS: RubricId[] = ["in_campus", "demo"];

export default async function ObservationReport({ params }: { params: { kind: string; id: string } }) {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "principal" && profile.role !== "owner") redirect("/dashboard");

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

  const rows = scoreRows(rubric, (o.answers || {}) as Answers);
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

          {o.strengths && <><h3>Strengths</h3><p style={{ margin: "0 0 13px" }}>{o.strengths}</p></>}
          {o.improvements && <><h3>Areas for Improvement</h3><p style={{ margin: "0 0 13px" }}>{o.improvements}</p></>}
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
                  <div style={{ color: "var(--sub)", textDecoration: "line-through" }}>{a.old_value || "(empty)"}</div>
                  <div style={{ color: "var(--navy)" }}>{a.new_value || "(empty)"}</div>
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

      {canAmend && (
        <AmendForm kind={kind} id={o.id} isDemo={isDemo}
          current={{
            final_remark: o.final_remark || "",
            follow_up: o.follow_up || "none",
            recommendation: o.recommendation || "consider",
            strengths: o.strengths || "",
            improvements: o.improvements || "",
          }} />
      )}
    </div>
  );
}
