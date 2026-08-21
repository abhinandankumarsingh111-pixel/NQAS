"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setVisibilityAction, deleteObservationAction } from "@/actions/observations";
import type { RubricId } from "@/lib/observation-rubrics";

/**
 * The two things you can do to a finished observation that are not amendments
 * of its content: decide who may read it, and (owner only) remove it.
 *
 * Both are logged. Who could see what, and from when, is exactly the kind of
 * question that gets asked a year later — and a record that can vanish without
 * a trace is not a record at all.
 */
export default function ObservationControls({
  kind, id, isPrincipal, isOwner, shared, who,
}: {
  kind: RubricId; id: string;
  isPrincipal: boolean; isOwner: boolean;
  shared: boolean; who: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  async function toggle() {
    setBusy(true); setErr(null);
    const res = await setVisibilityAction(kind, id, !shared);
    setBusy(false);
    if (!res.ok) { setErr(res.error || "Could not change sharing."); return; }
    router.refresh();
  }

  async function remove() {
    setBusy(true); setErr(null);
    const res = await deleteObservationAction(kind, id, reason);
    setBusy(false);
    if (!res.ok) { setErr(res.error || "Could not delete."); return; }
    router.push("/observe");
  }

  if (!isPrincipal && !isOwner) return null;

  return (
    <div className="card no-print" style={{ marginTop: 14 }}>
      {isPrincipal && (
        <>
          <div className="card-h"><h2>Who can see this</h2></div>
          <button type="button" className={`obs-share ${shared ? "on" : ""}`}
            disabled={busy} onClick={toggle}>
            <span className="obs-switch" aria-hidden="true"><i /></span>
            <span>
              <b>{shared ? "Visible to management" : "Private to you"}</b>
              {shared
                ? "Management can read this report. Tap to stop sharing."
                : "Only you and the owner can read it. Tap to share with management."}
            </span>
          </button>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 9, lineHeight: 1.6 }}>
            Sharing is off by default so an observation can be written candidly.
            Either way it stays on {who}&rsquo;s record and the owner can always read it.
            Every change here is logged.
          </div>
        </>
      )}

      {isOwner && (
        <div style={{ marginTop: isPrincipal ? 18 : 0, paddingTop: isPrincipal ? 14 : 0,
                      borderTop: isPrincipal ? "1px solid var(--line-soft)" : "none" }}>
          {!confirming ? (
            <>
              <div style={{ fontSize: 13, color: "var(--sub)", lineHeight: 1.6 }}>
                As owner you can remove this record &mdash; for a duplicate or a
                mistaken entry. What it contained is kept in the log afterwards,
                so a deletion is never invisible.
              </div>
              <button className="btn btn-danger btn-sm" style={{ marginTop: 10 }}
                onClick={() => setConfirming(true)}>
                Delete this observation
              </button>
            </>
          ) : (
            <>
              <div className="obs-warn" style={{ marginTop: 0 }}>
                <b>This cannot be undone.</b> {who}&rsquo;s record will no longer
                show this observation. A line naming the teacher, date and score
                stays in the amendment log.
              </div>
              <label className="obs-label">Reason <span>(kept permanently)</span></label>
              <textarea className="obs-remark" rows={2} value={reason}
                placeholder="Why is this being removed?"
                onChange={(e) => setReason(e.target.value)} />
              {err && <div className="obs-err">{err}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn btn-danger btn-sm" disabled={busy || !reason.trim()}
                  onClick={remove}>
                  {busy ? "Deleting…" : "Delete permanently"}
                </button>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => { setConfirming(false); setErr(null); }}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {err && !confirming && <div className="obs-err">{err}</div>}
    </div>
  );
}
