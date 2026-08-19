import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getProfile, createClient } from "@/lib/supabase/server";
import { teacherMetrics, campusBaseline, DAY_STATUS_ORDER, SAMPLING_LABEL, type MetricReport } from "@/lib/metrics";
import { CLASS_BAND_LABEL, STATUS_META, type ClassBand } from "@/lib/observations";
import RemarkComposer from "@/components/RemarkComposer";
import AcknowledgeButton from "@/components/AcknowledgeButton";
import PrintButton from "@/components/PrintButton";
import FacultyAdmin from "@/components/FacultyAdmin";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  complaint: "Complaint", appreciation: "Appreciation", observation: "Observation",
};

export default async function TeacherRecord({ params }: { params: { id: string } }) {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role === "coordinator") redirect("/verify");

  const supabase = createClient();
  const { data: f } = await supabase.from("faculty").select("*").eq("id", params.id).single();
  if (!f) notFound();

  const [{ data: mine }, { data: campusReports }, { data: remarks }, { data: acks }, { data: campus }, { data: postings }, { data: priorNames }] =
    await Promise.all([
      supabase.from("reports")
        .select("id, faculty_id, campus_id, date, class_band, class, subject, coordinator_id, coordinator_name, sampling_method, sample_size, students")
        .eq("faculty_id", params.id).is("deleted_at", null).order("date", { ascending: false }),
      supabase.from("reports")
        .select("id, campus_id, date, class_band, coordinator_id, coordinator_name, students")
        .eq("campus_id", f.campus_id).is("deleted_at", null),
      supabase.from("remarks").select("*").eq("faculty_id", params.id).order("occurred_on", { ascending: false }),
      supabase.from("remark_acknowledgements").select("*"),
      supabase.from("campuses").select("name").eq("id", f.campus_id).single(),
      supabase.from("faculty_postings").select("*, campuses(name)").eq("faculty_id", params.id).order("from_date"),
      supabase.from("faculty_previous_names").select("*").eq("faculty_id", params.id).order("changed_on"),
    ]);

  // Owner-only management data. Merge candidates are every OTHER faculty record
  // the owner can see, so a duplicate created at the wrong campus can still be
  // folded into the right one.
  const isOwner = profile.role === "owner";
  const { data: allCampuses } = isOwner
    ? await supabase.from("campuses").select("id, name").order("name")
    : { data: null };
  const { data: others } = isOwner
    ? await supabase.from("faculty").select("id, name, subject, campus_id").neq("id", params.id).order("name")
    : { data: null };

  const reports = (mine || []) as (MetricReport & { class: string; subject: string; sample_size: number })[];
  const m = teacherMetrics(reports);

  // Baseline: same campus, same window, so she is read against peers working
  // the same calendar rather than against an abstract ideal.
  const from = m.periodFrom, to = m.periodTo;
  const peers = ((campusReports || []) as MetricReport[])
    .filter((r) => !from || !to || (r.date >= from && r.date <= to));
  const base = campusBaseline(peers);

  const ackFor = new Map<string, { discussed_on: string; discussed_by_name: string }>();
  for (const a of (acks || []) as { remark_id: string; discussed_on: string; discussed_by_name: string }[]) {
    ackFor.set(a.remark_id, a);
  }

  const canFile = profile.role === "owner" || profile.role === "management"
    || (profile.role === "principal" && profile.campus_id === f.campus_id);

  type TimelineItem =
    | { kind: "report"; date: string; r: (typeof reports)[number] }
    | { kind: "remark"; date: string; rm: Record<string, unknown> };
  const timeline: TimelineItem[] = [
    ...reports.map((r) => ({ kind: "report" as const, date: r.date, r })),
    ...((remarks || []) as Record<string, unknown>[]).map((rm) => ({
      kind: "remark" as const, date: String(rm.occurred_on), rm,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const bands = Object.keys(m.medianDaysByBand) as ClassBand[];

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 10 }}>
        <Link href="/faculty" className="muted" style={{ fontSize: 13 }}>&larr; All faculty</Link>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>{f.name}{!f.active && <span className="fac-chip fac-chip-off" style={{ marginLeft: 8 }}>Inactive</span>}</h2>
          <PrintButton />
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: -4 }}>
          {(f.subjects && f.subjects.length ? f.subjects.join(" · ") : f.subject) || "Subject not recorded"} · {campus?.name || "—"}
          {f.employee_code && <> · Employee code {f.employee_code}</>}
        </div>

        {(priorNames || []).length > 0 && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Previously recorded as {(priorNames as { previous_name: string }[]).map((p) => p.previous_name).join(", ")}
          </div>
        )}
        {(postings || []).length > 1 && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Postings: {(postings as { from_date: string; to_date: string | null; campuses: { name: string } | null }[])
              .map((p) => `${p.campuses?.name || "—"} (${p.from_date}${p.to_date ? ` – ${p.to_date}` : " – present"})`).join(" · ")}
          </div>
        )}
      </div>

      {/* ---------------- objective figures ---------------- */}
      <div className="card">
        <div className="card-h"><h2>Copy correction</h2></div>

        {m.verifications === 0 ? (
          <div className="empty"><b>No verifications recorded yet.</b>
            <div className="muted" style={{ marginTop: 6 }}>Figures appear once this teacher has been verified.</div>
          </div>
        ) : (
          <>
            {m.provisional && (
              <div className="notice">
                <b>Provisional.</b> Based on {m.verifications} verification{m.verifications === 1 ? "" : "s"} covering {m.notebooks} notebook{m.notebooks === 1 ? "" : "s"}
                {m.coordinators === 1 && <>, all by a single coordinator</>}. Too little to draw a firm conclusion from.
              </div>
            )}

            <div className="figs">
              <div className="fig">
                <div className="fig-n">{m.behindPct ?? "—"}<small>%</small></div>
                <div className="fig-l">Notebooks behind</div>
                <div className="fig-b">
                  campus {base.behindPct ?? "—"}% over the same period
                </div>
              </div>
              <div className="fig">
                <div className="fig-n">{m.verifications}</div>
                <div className="fig-l">Verifications</div>
                <div className="fig-b">{m.notebooks} notebooks · {m.periodFrom} to {m.periodTo}</div>
              </div>
              <div className="fig">
                <div className="fig-n">{m.faultRate ?? "—"}<small>%</small></div>
                <div className="fig-l">Checking-quality flags</div>
                <div className="fig-b">{m.criticalCount > 0 ? `${m.criticalCount} critical` : "no critical failures"}</div>
              </div>
              <div className="fig">
                <div className="fig-n">{m.coordinators}</div>
                <div className="fig-l">Coordinator{m.coordinators === 1 ? "" : "s"}</div>
                <div className="fig-b">{m.coordinators === 1 ? "single source — weaker evidence" : "independently observed"}</div>
              </div>
            </div>

            <div className="bar" aria-label="Timeliness distribution">
              {DAY_STATUS_ORDER.map((k) => m.timelinessPct[k] > 0 && (
                <span key={k} style={{ width: `${m.timelinessPct[k]}%`, background: STATUS_META[k].color }} title={`${k}: ${m.timelinessPct[k]}%`} />
              ))}
            </div>
            <div className="bar-key">
              {DAY_STATUS_ORDER.map((k) => (
                <span key={k}><i style={{ background: STATUS_META[k].color }} />{k} {m.timelinessPct[k]}%</span>
              ))}
            </div>

            {bands.map((b) => (
              <div key={b} className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Median {m.medianDaysByBand[b]} days since checking · {CLASS_BAND_LABEL[b]}
                {base.medianDaysByBand[b] != null && <> (campus {base.medianDaysByBand[b]})</>}
              </div>
            ))}

            <div className="muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.65 }}>
              Timeliness is measured against the delay threshold for each class band, so primary and senior
              teaching are compared fairly. Only copy correction counts here — student handwriting, index and
              presentation appear on the reports below but are never counted against a teacher.
              {m.unscored > 0 && <> {m.unscored} notebook{m.unscored === 1 ? "" : "s"} predate observation capture and are excluded from the flag rate.</>}
              {m.samplingMethods.length > 0 && <> Sampling: {m.samplingMethods.map((s) => SAMPLING_LABEL[s] || s).join(", ")}.</>}
            </div>
          </>
        )}
      </div>

      {isOwner && (
        <div style={{ marginBottom: 14 }}>
          <FacultyAdmin
            faculty={{
              id: f.id, name: f.name, subjects: f.subjects, subject: f.subject,
              employee_code: f.employee_code, campus_id: f.campus_id, active: f.active,
            }}
            campuses={(allCampuses || []) as { id: string; name: string }[]}
            mergeCandidates={((others || []) as { id: string; name: string; subject: string | null; campus_id: string }[])
              .map((o) => ({
                id: o.id, name: o.name, subject: o.subject,
                campusName: ((allCampuses || []) as { id: string; name: string }[])
                  .find((c) => c.id === o.campus_id)?.name || "—",
              }))}
            verifications={reports.length}
            remarks={(remarks || []).length}
          />
        </div>
      )}

      {/* ---------------- remarks ---------------- */}
      {canFile && <RemarkComposer facultyId={f.id} facultyName={f.name} campusId={f.campus_id} />}

      {/* ---------------- timeline ---------------- */}
      <div className="card">
        <div className="card-h"><h2>Record</h2></div>
        {timeline.length === 0 ? (
          <div className="muted">Nothing recorded yet.</div>
        ) : timeline.map((t) => t.kind === "report" ? (
          <div key={`r-${t.r.id}`} className="tl tl-report">
            <div className="tl-date">{t.r.date}</div>
            <div className="tl-body">
              <Link href={`/reports/${t.r.id}`}><b>Verification</b> — {t.r.subject} · {t.r.class}</Link>
              <div className="muted" style={{ fontSize: 12 }}>
                {t.r.sample_size} notebooks · by {t.r.coordinator_name}
                {t.r.sampling_method && <> · {SAMPLING_LABEL[t.r.sampling_method] || t.r.sampling_method}</>}
              </div>
            </div>
          </div>
        ) : (
          <div key={`m-${String(t.rm.id)}`} className={`tl tl-remark tl-${String(t.rm.kind)}`}>
            <div className="tl-date">{String(t.rm.occurred_on)}</div>
            <div className="tl-body">
              <b>{KIND_LABEL[String(t.rm.kind)]}</b>
              <span className="muted" style={{ fontSize: 12 }}> — {String(t.rm.author_name)}, {String(t.rm.author_role)}</span>
              <p style={{ margin: "4px 0 0", fontSize: 13.5, whiteSpace: "pre-wrap" }}>{String(t.rm.body)}</p>
              <div style={{ marginTop: 6 }}>
                {ackFor.has(String(t.rm.id)) ? (
                  <span className="ack ack-done">
                    Discussed with faculty on {ackFor.get(String(t.rm.id))!.discussed_on} by {ackFor.get(String(t.rm.id))!.discussed_by_name}
                  </span>
                ) : canFile ? (
                  <AcknowledgeButton remarkId={String(t.rm.id)} />
                ) : (
                  <span className="ack ack-pending">Not yet discussed with faculty</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="muted print-only" style={{ fontSize: 11, marginTop: 10 }}>
        Krishna Vikash Group of CBSE Schools — teacher record for {f.name}, {campus?.name}.
        Covers {m.verifications} verification{m.verifications === 1 ? "" : "s"} ({m.periodFrom} to {m.periodTo}).
        Figures reflect copy-correction timeliness and checking quality only.
      </div>
    </div>
  );
}
