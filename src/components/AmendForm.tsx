"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { amendObservationAction } from "@/actions/observations";
import { FOLLOW_UP, RECOMMENDATION, PLAN_LABEL, type RubricId } from "@/lib/observation-rubrics";

/**
 * Correcting a submitted observation.
 *
 * The record is locked in the database, so this is the only door — and it is a
 * deliberately narrow one. Scores cannot be amended at all: a score is the
 * judgement made in the room, and a system that let it be revised afterwards
 * would make every observation arguable. What can change is the writing around
 * it — the remark, the summaries, the plan, and the decision that follows.
 *
 * The plan is here on purpose. It is the one part of an observation that
 * SHOULD move after the fact: the teacher does the thing, or it turns out not
 * to apply, or the two of them agree on something better in the follow-up
 * conversation. A plan that could not be revised would be a plan nobody
 * revisited.
 *
 * A reason is required, and the before-and-after is kept forever.
 */
type FieldKind = "text" | "lines" | "followup" | "recommendation";

const FIELDS: { id: string; label: string; kind: FieldKind }[] = [
  { id: "final_remark", label: "Final remark", kind: "text" },
  { id: "strengths", label: "Strengths", kind: "text" },
  { id: "improvements", label: "Areas for improvement", kind: "text" },
];

export default function AmendForm({
  kind, id, isDemo, current,
}: {
  kind: RubricId; id: string; isDemo: boolean;
  current: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState("final_remark");
  const [value, setValue] = useState(current.final_remark || "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fields = [
    ...FIELDS,
    { id: "plan", label: PLAN_LABEL[kind], kind: "lines" as const },
    isDemo
      ? { id: "recommendation", label: "Recommendation", kind: "recommendation" as const }
      : { id: "follow_up", label: "Follow-up", kind: "followup" as const },
  ];
  const active = fields.find((f) => f.id === field)!;

  function pickField(f: string) {
    setField(f);
    setValue(current[f] || "");
    setErr(null);
  }

  async function save() {
    setBusy(true); setErr(null);
    const res = await amendObservationAction(kind, id, field, value, reason);
    setBusy(false);
    if (!res.ok) { setErr(res.error || "Could not amend."); return; }
    setOpen(false); setReason("");
    router.refresh();
  }

  if (!open) {
    return (
      <div className="card no-print" style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13, color: "var(--sub)", lineHeight: 1.6 }}>
          This record is locked. Scores cannot be changed &mdash; they are the
          judgement you made in the room. The remarks, the {PLAN_LABEL[kind].toLowerCase()}{" "}
          and the {isDemo ? "recommendation" : "follow-up"} can be corrected, and
          every change is logged with your reason.
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>
          Amend this record
        </button>
      </div>
    );
  }

  return (
    <div className="card no-print" style={{ marginTop: 14 }}>
      <div className="card-h"><h2>Amend record</h2></div>

      <label className="obs-label">What are you correcting?</label>
      <div className="obs-options">
        {fields.map((f) => (
          <button key={f.id} type="button" className={`obs-opt ${field === f.id ? "on" : ""}`}
            onClick={() => pickField(f.id)}>
            <span className="obs-tick">{field === f.id ? "✓" : ""}</span>
            <span>{f.label}</span>
          </button>
        ))}
      </div>

      <label className="obs-label">
        Corrected value
        {active.kind === "lines" && <span>one action per line</span>}
      </label>
      {active.kind === "lines" ? (
        <>
          <textarea className="obs-remark" rows={6} value={value}
            placeholder="One action per line. Leave it empty to remove the plan entirely."
            onChange={(e) => setValue(e.target.value)} />
          <div className="muted" style={{ fontSize: 11.5, marginTop: -4, marginBottom: 4 }}>
            Lines you write here are recorded as your own words, so they lose the
            criterion each was originally tied to. The first line is the one that
            gets acted on &mdash; put it first deliberately.
          </div>
        </>
      ) : active.kind === "text" ? (
        <textarea className="obs-remark" rows={3} value={value}
          onChange={(e) => setValue(e.target.value)} />
      ) : (
        <div className="obs-options">
          {(active.kind === "followup" ? FOLLOW_UP : RECOMMENDATION).map((o) => (
            <button key={o.id} type="button" className={`obs-opt ${value === o.id ? "on" : ""}`}
              onClick={() => setValue(o.id)}>
              <span className="obs-tick">{value === o.id ? "✓" : ""}</span>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}

      <label className="obs-label">Reason <span>(recorded permanently)</span></label>
      <textarea className="obs-remark" rows={2} value={reason}
        placeholder="Why is this being corrected?"
        onChange={(e) => setReason(e.target.value)} />

      {err && <div className="obs-err">{err}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn btn-accent btn-sm" disabled={busy || !reason.trim()} onClick={save}>
          {busy ? "Saving…" : "Save amendment"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setErr(null); }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
