"use client";
import { useMemo, useState } from "react";
import { addFacultyAction } from "@/actions";
import { addDistinctFacultyAction } from "@/actions/faculty";
import { canonical, findExact, findSimilar, normaliseName } from "@/lib/similarity";

export interface Fac { id: string; name: string; subject: string | null }

/**
 * Three gates before a new teacher is created:
 *   1. normalise  — trim and collapse whitespace
 *   2. exact      — case-insensitive match offers the existing record
 *   3. similar    — near matches are surfaced as a suggestion
 *
 * The gates SUGGEST, never BLOCK. Adding is always one tap away, because a
 * coordinator blocked mid-verification will pick whichever nearby name clears
 * the screen — and a verification filed against the wrong teacher is far worse
 * than a duplicate row. That includes the case where the name genuinely belongs
 * to two different people: see the "different person" path below.
 */
export default function TeacherPicker({
  faculty, campusId, valueId, valueName, onPick,
}: {
  faculty: Fac[];
  campusId: string;
  valueId: string | null;
  valueName: string;
  onPick: (id: string | null, name: string, subject?: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("");
  const [confirming, setConfirming] = useState(false);
  // Set when the coordinator declares this is a DIFFERENT person who happens to
  // share a name with someone already on the list.
  const [distinct, setDistinct] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const typed = normaliseName(q);
  const matches = useMemo(() => {
    if (!typed) return faculty.slice(0, 8);
    const c = canonical(typed);
    return faculty.filter((f) => canonical(f.name).includes(c)).slice(0, 8);
  }, [typed, faculty]);

  const exact = typed ? findExact(typed, faculty) : undefined;
  const similar = useMemo(() => (typed ? findSimilar(typed, faculty) : []), [typed, faculty]);

  // Same name at one campus is allowed when the subject differs, so a repeated
  // name is only a duplicate if the subject matches too.
  const sameNameDifferentSubject = exact && subject && canonical(exact.subject || "") !== canonical(subject);

  async function create() {
    setBusy(true); setErr(null);
    const res = distinct
      ? await addDistinctFacultyAction(campusId, typed, subject)
      : await addFacultyAction(campusId, typed, subject);
    setBusy(false);
    if (!res.ok) { setErr(res.error || "Could not add."); return; }
    onPick(res.id!, res.name!, res.subject ?? null);
    setQ(""); setSubject(""); setConfirming(false); setDistinct(false);
  }

  if (valueId) {
    return (
      <div className="tp-picked">
        <div>
          <b>{valueName}</b>
          <span className="muted" style={{ fontSize: 12 }}>
            {faculty.find((f) => f.id === valueId)?.subject ? ` · ${faculty.find((f) => f.id === valueId)!.subject}` : ""}
          </span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPick(null, "")}>Change</button>
      </div>
    );
  }

  return (
    <div className="tp">
      <input
        className="input" value={q} autoComplete="off"
        placeholder="Type the teacher's name"
        onChange={(e) => { setQ(e.target.value); setConfirming(false); setErr(null); }}
      />

      {matches.length > 0 && (
        <div className="tp-list">
          {matches.map((f) => (
            <button key={f.id} type="button" className="tp-opt" onClick={() => onPick(f.id, f.name, f.subject)}>
              <span>{f.name}</span>
              {f.subject && <span className="muted" style={{ fontSize: 11.5 }}>{f.subject}</span>}
            </button>
          ))}
        </div>
      )}

      {typed.length > 1 && !confirming && (
        <>
          {exact && !sameNameDifferentSubject ? (
            <div className="tp-note">
              <b>{exact.name}</b> is already on the list
              {exact.subject ? ` (${exact.subject})` : ""} — pick them above rather than adding again.
              <button type="button"
                style={{
                  display: "block", marginTop: 6, padding: 0, background: "none", border: "none",
                  color: "var(--teal)", fontSize: 12, fontFamily: "var(--font-body)",
                  textDecoration: "underline", cursor: "pointer",
                }}
                onClick={() => { setDistinct(true); setConfirming(true); }}>
                This is a different person with the same name
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm tp-add" onClick={() => setConfirming(true)}>
              + Add &ldquo;{typed}&rdquo; as a new teacher
            </button>
          )}
        </>
      )}

      {confirming && (
        <div className="tp-confirm">
          {distinct && (
            <div style={{ marginBottom: 10 }}>
              <b>A second, separate record</b> will be created for {typed}. It is given a provisional
              identifier so the two are never confused, and flagged for the owner to replace with the
              real employee code. The existing {typed} is left untouched.
            </div>
          )}
          {!distinct && similar.length > 0 && (
            <>
              <b>Did you mean one of these?</b>
              <div className="tp-sugg">
                {similar.map((f) => (
                  <button key={f.id} type="button" className="btn btn-ghost btn-sm"
                    onClick={() => { onPick(f.id, f.name, f.subject); setQ(""); setConfirming(false); }}>
                    {f.name}{f.subject ? ` · ${f.subject}` : ""}
                  </button>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 11.5, margin: "8px 0" }}>
                Picking an existing teacher keeps their record in one piece.
              </div>
            </>
          )}

          <label className="label">Subject they teach</label>
          <input className="input" value={subject} autoComplete="off"
            placeholder="e.g. Hindi — distinguishes teachers who share a name"
            onChange={(e) => setSubject(e.target.value)} />

          {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={create}>
              {busy ? "Adding…" : `Add ${typed}`}
            </button>
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={() => { setConfirming(false); setDistinct(false); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
