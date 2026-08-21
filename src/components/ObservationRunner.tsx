"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RUBRICS, FOLLOW_UP, RECOMMENDATION, type RubricId,
} from "@/lib/observation-rubrics";
import {
  type Answers, answerFor, totalsFor, summarise, scoreRows, GRADE_COLOR,
} from "@/lib/observation-scoring";
import { saveProgressAction, submitObservationAction } from "@/actions/observations";

/**
 * The observation runner.
 *
 * One criterion per screen, thumb-sized targets, no typing required to finish.
 * Everything difficult happens in the scoring engine; this file's whole job is
 * to stay out of the principal's way while they are watching a lesson.
 *
 * AUTOSAVE runs on every change, to localStorage instantly and to the server
 * shortly after. A principal in a classroom will take a call, lock the phone,
 * or lose signal, and none of those may cost them the observation.
 */
export default function ObservationRunner({
  kind, id, heading, subheading,
}: {
  kind: RubricId; id: string; heading: string; subheading: string;
}) {
  const rubric = RUBRICS[kind];
  const router = useRouter();
  const lastStep = rubric.criteria.length;          // the review screen

  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [remarkOpen, setRemarkOpen] = useState(false);
  const [finalRemark, setFinalRemark] = useState("");
  const [outcome, setOutcome] = useState(kind === "in_campus" ? "none" : "consider");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const storeKey = `nqas.obs.${kind}.${id}`;

  // Restore anything the browser still holds before the first paint the
  // principal sees, so a resumed observation never flashes as empty.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.answers) setAnswers(d.answers);
        if (typeof d.step === "number") setStep(Math.min(d.step, lastStep));
        if (typeof d.finalRemark === "string") setFinalRemark(d.finalRemark);
        if (typeof d.outcome === "string") setOutcome(d.outcome);
      }
    } catch { /* private mode, cleared storage — the server draft still stands */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((next: Answers, nextStep: number, remark: string, out: string) => {
    try {
      localStorage.setItem(storeKey, JSON.stringify({
        answers: next, step: nextStep, finalRemark: remark, outcome: out,
      }));
    } catch { /* not fatal — the server copy below is the real one */ }

    setSaving("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const res = await saveProgressAction(kind, id, next);
      setSaving(res.ok ? "saved" : "idle");
    }, 700);
  }, [kind, id, storeKey]);

  const criterion = step < lastStep ? rubric.criteria[step] : null;
  const current = criterion ? answers[criterion.id] : undefined;
  const totals = useMemo(() => totalsFor(rubric, answers), [rubric, answers]);
  const rows = useMemo(() => scoreRows(rubric, answers), [rubric, answers]);
  const summary = useMemo(() => summarise(rubric, answers), [rubric, answers]);

  function tap(optionId: string) {
    if (!criterion) return;
    const prev = answers[criterion.id];
    const already = prev?.selected || [];
    const selected = criterion.mode === "scale"
      ? [optionId]
      : already.includes(optionId) ? already.filter((x) => x !== optionId) : [...already, optionId];

    const next = { ...answers, [criterion.id]: answerFor(criterion, selected, prev) };
    if (selected.length === 0) delete next[criterion.id];
    setAnswers(next);
    setEditing(false);
    persist(next, step, finalRemark, outcome);
  }

  function setScore(value: number) {
    if (!criterion || !current) return;
    const next = { ...answers, [criterion.id]: { ...current, score: value } };
    setAnswers(next);
    persist(next, step, finalRemark, outcome);
  }

  function setRemark(text: string) {
    if (!criterion || !current) return;
    const next = { ...answers, [criterion.id]: { ...current, remark: text } };
    setAnswers(next);
    persist(next, step, finalRemark, outcome);
  }

  function go(to: number) {
    const clamped = Math.max(0, Math.min(lastStep, to));
    setStep(clamped); setEditing(false); setRemarkOpen(false); setErr(null);
    persist(answers, clamped, finalRemark, outcome);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }

  async function submit() {
    setBusy(true); setErr(null);
    const res = await submitObservationAction(kind, id, {
      answers,
      finalRemark,
      ...(kind === "in_campus" ? { followUp: outcome } : { recommendation: outcome }),
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error || "Could not submit."); return; }
    try { localStorage.removeItem(storeKey); } catch { /* nothing to clear */ }
    router.push(`/observe/report/${kind}/${id}`);
  }

  // -------------------------------------------------------------------------
  return (
    <div className="obs">
      <div className="obs-top">
        <div>
          <div className="obs-h">{heading}</div>
          <div className="obs-sub">{subheading}</div>
        </div>
        <span className={`obs-save obs-save-${saving}`}>
          {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : ""}
        </span>
      </div>

      {/* Progress rail. Completed criteria stay tappable, because a judgement
          made at criterion 2 often looks different by criterion 6. */}
      <div className="obs-rail">
        {rubric.criteria.map((c, i) => (
          <button key={c.id} type="button"
            className={`obs-pip ${i === step ? "on" : ""} ${answers[c.id] ? "done" : ""}`}
            aria-label={`${c.name}${answers[c.id] ? " — answered" : ""}`}
            onClick={() => go(i)}>
            {answers[c.id] && i !== step ? "✓" : i + 1}
          </button>
        ))}
        <button type="button" className={`obs-pip obs-pip-review ${step === lastStep ? "on" : ""}`}
          aria-label="Review" onClick={() => go(lastStep)}>★</button>
      </div>

      {criterion && (
        <div className="obs-card">
          <div className="obs-count">
            {String(step + 1).padStart(2, "0")} / {String(rubric.criteria.length).padStart(2, "0")}
          </div>
          <h2 className="obs-name">{criterion.name}</h2>
          <p className="obs-prompt">{criterion.prompt}</p>
          <div className="obs-mode">
            {criterion.mode === "scale" ? "Choose one" : "Tap everything you saw"}
            <span className="obs-marks">{criterion.max} marks</span>
          </div>

          <div className="obs-options">
            {criterion.options.map((o) => {
              const on = current?.selected.includes(o.id);
              return (
                <button key={o.id} type="button"
                  className={`obs-opt ${on ? "on" : ""} ${o.tone === "negative" ? "neg" : ""}`}
                  onClick={() => tap(o.id)}>
                  <span className="obs-tick">{on ? "✓" : ""}</span>
                  <span>{o.label}</span>
                </button>
              );
            })}
          </div>

          {current && (
            <div className="obs-score">
              <div className="obs-score-row">
                <span>Score</span>
                <b>{current.score} / {criterion.max}</b>
                <button type="button" className="obs-edit" onClick={() => setEditing((v) => !v)}>
                  {editing ? "Done" : "✎ Edit"}
                </button>
              </div>
              {current.score !== current.auto && (
                <div className="obs-overridden">Your score — the system suggested {current.auto}</div>
              )}
              {editing && (
                <div className="obs-dial">
                  {Array.from({ length: criterion.max + 1 }, (_, n) => (
                    <button key={n} type="button"
                      className={`obs-num ${current.score === n ? "on" : ""}`}
                      onClick={() => setScore(n)}>{n}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {current && (remarkOpen || current.remark ? (
            <textarea className="obs-remark" rows={2} value={current.remark || ""}
              placeholder="Anything worth recording (optional)"
              onChange={(e) => setRemark(e.target.value)} />
          ) : (
            <button type="button" className="obs-addremark" onClick={() => setRemarkOpen(true)}>
              + Add remark
            </button>
          ))}
        </div>
      )}

      {step === lastStep && (
        <div className="obs-card">
          <h2 className="obs-name">Review</h2>
          <p className="obs-prompt">Tap any score to change it. The total updates as you go.</p>

          <div className="obs-review">
            {rows.map((r, i) => (
              <button key={r.id} type="button" className="obs-rrow" onClick={() => go(i)}>
                <span className="obs-rname">
                  {r.name}
                  {r.edited && <em className="obs-rflag">edited</em>}
                </span>
                <span className={`obs-rscore ${r.answered ? "" : "missing"}`}>
                  {r.answered ? `${r.score} / ${r.max}` : `— / ${r.max}`} <em>✎</em>
                </span>
              </button>
            ))}
          </div>

          <div className="obs-total" style={{ borderColor: GRADE_COLOR[totals.grade] }}>
            <div>
              <span>Total</span>
              <b>{totals.earned} <i>/ {totals.max}</i></b>
            </div>
            <div className="obs-grade" style={{ background: GRADE_COLOR[totals.grade] }}>
              {totals.grade} · {totals.pct}%
            </div>
          </div>

          {totals.unanswered.length > 0 && (
            <div className="obs-warn">
              {totals.unanswered.length} criteri{totals.unanswered.length === 1 ? "on" : "a"} still
              to answer. Tap the numbered dots above to go back.
            </div>
          )}

          {(summary.strengths || summary.improvements) && (
            <div className="obs-summary">
              {summary.strengths && <p><b>Strengths.</b> {summary.strengths}</p>}
              {summary.improvements && <p><b>To work on.</b> {summary.improvements}</p>}
              <span>Written for you from your selections. You can edit it after submitting.</span>
            </div>
          )}

          <label className="obs-label">
            {kind === "in_campus" ? "Follow-up" : "Recommendation"}
          </label>
          <div className="obs-options">
            {(kind === "in_campus" ? FOLLOW_UP : RECOMMENDATION).map((o) => (
              <button key={o.id} type="button"
                className={`obs-opt ${outcome === o.id ? "on" : ""}`}
                onClick={() => { setOutcome(o.id); persist(answers, step, finalRemark, o.id); }}>
                <span className="obs-tick">{outcome === o.id ? "✓" : ""}</span>
                <span>{o.label}</span>
              </button>
            ))}
          </div>

          <label className="obs-label">Final remark <span>(optional)</span></label>
          <textarea className="obs-remark" rows={3} value={finalRemark}
            placeholder="Anything you want on the record"
            onChange={(e) => { setFinalRemark(e.target.value); persist(answers, step, e.target.value, outcome); }} />

          {err && <div className="obs-err">{err}</div>}

          <button type="button" className="obs-submit" disabled={busy || totals.unanswered.length > 0}
            onClick={submit}>
            {busy ? "Submitting…" : "Submit Observation"}
          </button>
          <p className="obs-locknote">
            Once submitted this becomes part of the official record and is locked.
            Corrections afterwards are possible, and are logged with a reason.
          </p>
        </div>
      )}

      <div className="obs-nav">
        <button type="button" className="obs-back" onClick={() => go(step - 1)} disabled={step === 0}>
          ← Back
        </button>
        {step < lastStep ? (
          <button type="button" className="obs-next" onClick={() => go(step + 1)}>
            {step === lastStep - 1 ? "Review →" : "Next →"}
          </button>
        ) : (
          <span className="obs-navtotal">{totals.earned} / {totals.max}</span>
        )}
      </div>
    </div>
  );
}
