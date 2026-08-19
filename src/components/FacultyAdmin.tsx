"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateFacultyAction, deleteFacultyAction, mergeFacultyAction } from "@/actions/faculty";

export interface AdminFaculty {
  id: string; name: string; subjects: string[] | null; subject: string | null;
  employee_code: string | null; campus_id: string; active: boolean;
}
export interface CampusOpt { id: string; name: string }
export interface MergeOpt { id: string; name: string; subject: string | null; campusName: string }

/**
 * Owner-only. Coordinators add teachers through the verification picker;
 * everything else about a personnel record — its name, subjects, campus,
 * whether it is still active, and whether it exists at all — is the owner's.
 */
export default function FacultyAdmin({
  faculty, campuses, mergeCandidates, verifications, remarks,
}: {
  faculty: AdminFaculty; campuses: CampusOpt[]; mergeCandidates: MergeOpt[];
  verifications: number; remarks: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [name, setName] = useState(faculty.name);
  const [subjectText, setSubjectText] = useState((faculty.subjects || []).join(", "));
  const [code, setCode] = useState(faculty.employee_code || "");
  const [campusId, setCampusId] = useState(faculty.campus_id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mergeInto, setMergeInto] = useState("");

  const hasHistory = verifications > 0 || remarks > 0;
  const campusChanged = campusId !== faculty.campus_id;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string, goList = false) =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      if (!res.ok) { setMsg({ ok: false, text: res.error || "Could not save." }); return; }
      setMsg({ ok: true, text: okText });
      if (goList) router.push("/faculty"); else router.refresh();
    });

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm no-print" onClick={() => setOpen(true)}>
        ⚙ Manage this record
      </button>
    );
  }

  return (
    <div className="card no-print">
      <div className="card-h"><h2>Manage record</h2></div>

      <div className="row">
        <div className="grow">
          <label className="label">Full name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grow">
          <label className="label">Employee code</label>
          <input className="input" value={code} placeholder="optional"
            style={{ textTransform: "uppercase" }} onChange={(e) => setCode(e.target.value)} />
        </div>
      </div>

      <label className="label" style={{ marginTop: 10 }}>Subjects handled</label>
      <input className="input" value={subjectText} onChange={(e) => setSubjectText(e.target.value)}
        placeholder="e.g. Maths, Science — separate with commas" />
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
        The first subject is shown in the verification picker and the directory.
      </div>

      <label className="label" style={{ marginTop: 10 }}>Campus</label>
      <select className="input" value={campusId} onChange={(e) => setCampusId(e.target.value)}>
        {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {campusChanged && (
        <div className="notice" style={{ marginTop: 8, marginBottom: 0 }}>
          This is recorded as a <b>transfer</b>, not a correction. Past verifications stay attached to the
          campus where they happened, and the move is written to the posting history.
        </div>
      )}

      {msg && <div className={msg.ok ? "ok" : "err"} style={{ marginTop: 10 }}>{msg.text}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" disabled={pending}
          onClick={() => run(() => updateFacultyAction(faculty.id, {
            name, employeeCode: code, campusId,
            subjects: subjectText.split(",").map((x) => x.trim()).filter(Boolean),
          }), "Saved.")}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Close</button>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--line-soft)", margin: "16px 0" }} />

      {/* ---- leaving ---- */}
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>
        <b>{faculty.active ? "This teacher has left" : "Reinstate this teacher"}</b>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
          {faculty.active
            ? "Hides them from the verification picker and the default list. The record and its full history stay intact and readable."
            : "Currently inactive. Reinstating returns them to the picker."}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} disabled={pending}
          onClick={() => run(() => updateFacultyAction(faculty.id, { active: !faculty.active }),
            faculty.active ? "Marked as left. Record retained." : "Reinstated.")}>
          {faculty.active ? "Mark as left" : "Reinstate"}
        </button>
      </div>

      {/* ---- merge ---- */}
      {mergeCandidates.length > 0 && (
        <>
          <hr style={{ border: "none", borderTop: "1px solid var(--line-soft)", margin: "16px 0" }} />
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <b>This is a duplicate of another record</b>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
              Moves this record&rsquo;s {verifications} verification{verifications === 1 ? "" : "s"} onto the one you
              choose, keeps this name as a former name, then removes this empty record.
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <select className="input" style={{ flex: "1 1 240px" }} value={mergeInto}
                onChange={(e) => setMergeInto(e.target.value)}>
                <option value="">Merge into…</option>
                {mergeCandidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.subject ? ` · ${m.subject}` : ""} · {m.campusName}
                  </option>
                ))}
              </select>
              <button className="btn btn-ghost btn-sm" disabled={pending || !mergeInto}
                onClick={() => run(() => mergeFacultyAction(faculty.id, mergeInto), "Merged.", true)}>
                Merge
              </button>
            </div>
            {remarks > 0 && (
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                Not available: this record carries {remarks} permanent remark{remarks === 1 ? "" : "s"},
                which cannot be moved to another person. Mark it as left instead.
              </div>
            )}
          </div>
        </>
      )}

      {/* ---- delete ---- */}
      <hr style={{ border: "none", borderTop: "1px solid var(--line-soft)", margin: "16px 0" }} />
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>
        <b style={{ color: hasHistory ? "var(--sub)" : "var(--red)" }}>Delete permanently</b>
        {hasHistory ? (
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            Not available. This record has {verifications} verification{verifications === 1 ? "" : "s"} and{" "}
            {remarks} remark{remarks === 1 ? "" : "s"} attached, so it cannot be erased — that is what makes the
            record worth something later. Mark them as left, or merge if it is a duplicate.
          </div>
        ) : !confirmDelete ? (
          <>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
              Nothing is attached to this record — no verifications, no remarks — so deleting it loses nothing.
            </div>
            <button className="btn btn-danger btn-sm" style={{ marginTop: 8 }}
              onClick={() => setConfirmDelete(true)}>Delete permanently</button>
          </>
        ) : (
          <div className="confirm">
            Permanently remove <b>{faculty.name}</b>? This cannot be undone.
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn btn-danger btn-sm" disabled={pending}
                onClick={() => run(() => deleteFacultyAction(faculty.id), "Deleted.", true)}>
                {pending ? "Deleting…" : "Yes, delete"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
