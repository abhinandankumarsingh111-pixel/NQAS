"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, OBSERVATIONS } from "@/lib/observations";
import { daysSince, rulesEngine, checkConsistency, remarkTrack1, type StudentInput } from "@/lib/engine";
import { saveReportAction } from "@/actions";
import ReportView, { bandChip, type ReportData } from "@/components/ReportView";

const STEPS = ["Details", "Students & Observations", "Preview", "Report"];
const emptyStudent = (): StudentInput & { customDraft: string } => ({ name: "", lastChecked: "", selected: [], customs: [], customDraft: "" });

export default function VerifyClient({ campusName, coordinatorName }: { campusName: string; coordinatorName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [academic, setAcademic] = useState({ teacher: "", cls: "", subject: "" });
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState([emptyStudent()]);
  const [useAI, setUseAI] = useState(true);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const warnings = useMemo(() => students.flatMap((s) => checkConsistency(s.selected)), [students]);
  const setStudent = (i: number, patch: Partial<typeof students[number]>) =>
    setStudents((a) => a.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const toggle = (i: number, id: string) =>
    setStudents((a) => a.map((s, k) => k !== i ? s : ({ ...s, selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] })));

  const canGo = step === 0
    ? academic.teacher && academic.cls && academic.subject && date
    : step === 1 ? students.every((s) => s.name) && students.some((s) => s.selected.length > 0) : true;

  async function generate() {
    setBusy(true);
    const meta = { campus: campusName, coordinatorName, date };
    const cleanStudents: StudentInput[] = students.map((s) => ({ name: s.name, lastChecked: s.lastChecked, selected: s.selected, customs: s.customs }));

    // Ask the server to build the report (deterministic + optional AI paragraphs).
    let built: ReportData;
    try {
      const res = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meta, academic, students: cleanStudents, useAI }),
      });
      built = await res.json();
    } catch {
      setBusy(false); setSaveMsg({ ok: false, text: "Could not generate the report. Please try again." }); return;
    }

    // Persist it.
    const saved = await saveReportAction({
      academic, date, students: built.students, recs: built.recs,
      finalObservation: built.finalObservation, principalSummary: built.principalSummary, engine: built.engine,
    });
    setReport(built);
    setSaveMsg(saved.ok
      ? { ok: true, text: "✓ Report saved to the server archive — visible on the Management dashboard." }
      : { ok: false, text: "⚠ Report generated but could not be saved. Download it manually below." });
    setBusy(false); setStep(3);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {STEPS.map((s, i) => <div key={s} className={`step ${i === step ? "on" : i < step ? "done" : ""}`}>{i + 1}. {s}</div>)}
      </div>

      {step === 0 && (
        <div className="card">
          <div className="card-h"><h2>Verification Details</h2></div>
          <div className="row">
            <div className="grow"><label className="label">Teacher</label><input className="input" value={academic.teacher} onChange={(e) => setAcademic({ ...academic, teacher: e.target.value })} /></div>
            <div className="grow"><label className="label">Class / Section</label><input className="input" placeholder="e.g. IX-A" value={academic.cls} onChange={(e) => setAcademic({ ...academic, cls: e.target.value })} /></div>
            <div className="grow"><label className="label">Subject</label><input className="input" value={academic.subject} onChange={(e) => setAcademic({ ...academic, subject: e.target.value })} /></div>
            <div className="grow"><label className="label">Date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div className="muted">Campus is fixed to <b>{campusName}</b> for your ID.</div>
        </div>
      )}

      {step === 1 && (
        <div>
          {students.map((s, i) => (
            <div className="card" key={i}>
              <div className="card-h">
                <h2>Student Sample {i + 1}</h2>
                {students.length > 1 && <button className="btn btn-danger btn-sm" onClick={() => setStudents((a) => a.filter((_, k) => k !== i))}>Remove</button>}
              </div>
              <div className="row">
                <div style={{ flex: "2 1 200px" }}><label className="label">Student Name</label><input className="input" value={s.name} onChange={(e) => setStudent(i, { name: e.target.value })} /></div>
                <div style={{ flex: "1 1 150px" }}><label className="label">Last Checked Date</label><input className="input" type="date" value={s.lastChecked} onChange={(e) => setStudent(i, { lastChecked: e.target.value })} /></div>
                <div style={{ flex: "0 1 120px" }}><label className="label">Days Since (auto)</label><div className="input" style={{ background: "var(--chip)", fontWeight: 700, color: "var(--navy)" }}>{daysSince(s.lastChecked, date) ?? "—"}</div></div>
              </div>
              {CATEGORIES.map((cat) => (
                <div key={cat.id} style={{ marginBottom: 11 }}>
                  <div style={{ fontSize: 11.5, color: "var(--teal)", fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>{cat.name}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {OBSERVATIONS.filter((o) => o.cat === cat.id).map((o) => (
                      <button key={o.id} className={`chip ${s.selected.includes(o.id) ? "on" : ""}`} onClick={() => toggle(i, o.id)}>{o.label}</button>
                    ))}
                  </div>
                </div>
              ))}
              {s.customs.map((c, k) => (
                <div key={k} style={{ fontSize: 13, background: "var(--paper)", border: "1px solid var(--line-soft)", borderRadius: 4, padding: "6px 10px", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                  <span>&ldquo;{c}&rdquo;</span>
                  <button onClick={() => setStudent(i, { customs: s.customs.filter((_, x) => x !== k) })} style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer" }}>×</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <input className="input" style={{ flex: 1 }} placeholder="+ Custom observation (optional)" value={s.customDraft}
                  onChange={(e) => setStudent(i, { customDraft: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter" && s.customDraft.trim()) setStudent(i, { customs: [...s.customs, s.customDraft.trim()], customDraft: "" }); }} />
                <button className="btn btn-ghost btn-sm" onClick={() => s.customDraft.trim() && setStudent(i, { customs: [...s.customs, s.customDraft.trim()], customDraft: "" })}>Add</button>
              </div>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={() => setStudents((a) => [...a, emptyStudent()])}>+ Add another student</button>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <div className="card-h"><h2>Preview</h2></div>
          {warnings.length > 0 && (
            <div style={{ background: "#FDF3E7", border: "1px solid var(--orange)", borderRadius: 5, padding: "11px 13px", marginBottom: 14 }}>
              <b style={{ color: "#C4581B", fontSize: 13 }}>Please review — possible contradictions</b>
              {warnings.map((w, k) => <div key={k} style={{ fontSize: 13, marginTop: 4 }}>• {w}</div>)}
            </div>
          )}
          <div style={{ fontSize: 14 }}><b>{academic.subject}</b> ({academic.cls}) · {academic.teacher} · {date} · {campusName}</div>
          {students.map((s, i) => {
            const d = daysSince(s.lastChecked, date); const { band, cpi } = rulesEngine(s.selected, d);
            return (
              <div key={i} style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 11, marginTop: 11 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                  <b style={{ color: "var(--navy)" }}>{s.name || `Student ${i + 1}`}</b>
                  <span className="muted" style={{ fontSize: 11.5 }}>CPI: {cpi} · {d ?? "—"} days · {bandChip(band)}</span>
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 4 }}>{remarkTrack1(s, i)}</div>
              </div>
            );
          })}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontSize: 13, color: "var(--sub)" }}>
            <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
            Use AI narrative for Final Observation &amp; Principal Summary (auto-fallback if unavailable)
          </label>
        </div>
      )}

      {step === 3 && report && (
        <div>
          {saveMsg && <div className={saveMsg.ok ? "ok" : "err"}>{saveMsg.text}</div>}
          <ReportView r={report} />
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => router.push("/reports")}>Done — view my reports</button>
            <button className="btn btn-ghost" onClick={() => { setReport(null); setStudents([emptyStudent()]); setAcademic({ teacher: "", cls: "", subject: "" }); setStep(0); }}>New verification</button>
          </div>
        </div>
      )}

      {step < 3 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>← Back</button>
          {step < 2
            ? <button className="btn btn-primary" onClick={() => canGo && setStep(step + 1)} disabled={!canGo}>Continue →</button>
            : <button className="btn btn-accent" onClick={generate} disabled={busy}>{busy ? "Generating & saving…" : "Generate & Save Report →"}</button>}
        </div>
      )}
    </div>
  );
}
