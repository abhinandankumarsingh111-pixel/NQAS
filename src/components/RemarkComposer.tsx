"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { fileRemarkAction } from "@/actions";

const KINDS = [
  { id: "appreciation", label: "Appreciation" },
  { id: "observation", label: "Observation" },
  { id: "complaint", label: "Complaint" },
] as const;

function Submit({ kind }: { kind: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary btn-sm" disabled={pending}>
      {pending ? "Filing…" : `File ${kind}`}
    </button>
  );
}

/**
 * Files a permanent remark. Appreciation is deliberately listed first and costs
 * exactly the same number of taps as a complaint: if praise were harder to file
 * than criticism, every record would read as a rap sheet within a year,
 * including the good teachers'.
 */
export default function RemarkComposer({
  facultyId, facultyName, campusId, coordinatorId, reportId, compact,
}: {
  facultyId?: string; facultyName: string; campusId?: string;
  coordinatorId?: string; reportId?: string; compact?: boolean;
}) {
  const [state, action] = useFormState(fileRemarkAction, null as { error?: string; ok?: string } | null);
  const [open, setOpen] = useState(!compact);
  const [kind, setKind] = useState<string>("appreciation");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);

  if (state?.ok) {
    return <div className="card"><div className="ok">{state.ok}</div></div>;
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm no-print" onClick={() => setOpen(true)}>
        + Add a remark about {facultyName}
      </button>
    );
  }

  return (
    <form action={action} className="card no-print">
      <div className="card-h"><h2>File a remark{compact ? "" : ` — ${facultyName}`}</h2></div>

      {facultyId && <input type="hidden" name="facultyId" value={facultyId} />}
      {coordinatorId && <input type="hidden" name="coordinatorId" value={coordinatorId} />}
      {reportId && <input type="hidden" name="reportId" value={reportId} />}
      {campusId && <input type="hidden" name="campusId" value={campusId} />}
      <input type="hidden" name="subjectName" value={facultyName} />
      <input type="hidden" name="kind" value={kind} />

      <div className="kindpick">
        {KINDS.map((k) => (
          <button key={k.id} type="button"
            className={`kind ${kind === k.id ? "on" : ""} kind-${k.id}`}
            onClick={() => { setKind(k.id); setConfirming(false); }}>
            {k.label}
          </button>
        ))}
      </div>

      <label className="label" style={{ marginTop: 10 }}>Remark</label>
      <textarea
        className="input" name="body" rows={4} value={body}
        onChange={(e) => { setBody(e.target.value); setConfirming(false); }}
        placeholder="What was observed, and when. Be specific — this will be read years from now by someone who was not there."
      />

      <label className="label" style={{ marginTop: 10 }}>Date this happened</label>
      <input className="input" type="date" name="occurredOn" defaultValue={new Date().toISOString().slice(0, 10)} style={{ maxWidth: 200 }} />

      {state?.error && <div className="err" style={{ marginTop: 8 }}>{state.error}</div>}

      {!confirming ? (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-primary btn-sm"
            disabled={!body.trim()}
            onClick={() => setConfirming(true)}>Review and file</button>
          {compact && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>}
        </div>
      ) : (
        <div className="confirm">
          <b>This is permanent.</b> Once filed, this remark cannot be edited or deleted by anyone,
          including you. It becomes part of {facultyName}&rsquo;s record and may be read in a future
          review. A correction can only be filed as a further remark.
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Submit kind={KINDS.find((k) => k.id === kind)!.label.toLowerCase()} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>Go back</button>
          </div>
        </div>
      )}
    </form>
  );
}
