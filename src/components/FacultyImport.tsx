"use client";
import { useMemo, useRef, useState } from "react";
import { importFacultyAction } from "@/actions/roster";
import { IMPORT_TEMPLATE, parseFacultyImport, type ImportRow } from "@/lib/facultyImport";

/**
 * Bulk roster import, owner only.
 *
 * The whole design of this is the preview. Creating forty personnel records
 * from a paste is not something to do on trust, so nothing is written until
 * the owner has seen, row by row, what will be created and what will be
 * skipped and why. Rows that are already on the roll are shown as skipped
 * rather than hidden — a silent skip looks identical to a bug when the count
 * at the end is lower than the number of lines pasted.
 *
 * The parse here is only for showing. The server parses again against a fresh
 * read of the roll before it writes anything.
 */
const VERDICT_LABEL: Record<ImportRow["verdict"], string> = {
  "new": "Will be added",
  "already-on-roll": "Already on the roll",
  "duplicate-in-file": "Repeated in this list",
  "invalid": "Cannot read",
};

export default function FacultyImport({
  campusId, campusName, existingNames, needsCampusChoice,
}: {
  campusId: string | null;
  campusName: string;
  existingNames: string[];
  needsCampusChoice: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(
    () => (text.trim() ? parseFacultyImport(text, existingNames) : null),
    [text, existingNames],
  );

  async function run() {
    if (!campusId || !parsed?.importable.length) return;
    setBusy(true); setMsg(null);
    const res = await importFacultyAction(campusId, text);
    setBusy(false);
    if (!res.ok) { setMsg({ error: res.error }); return; }
    setMsg({ ok: `Added ${res.created} teacher${res.created === 1 ? "" : "s"} to ${campusName}` +
      (res.skipped ? `, skipped ${res.skipped}.` : ".") });
    setText("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function loadFile(f: File | undefined) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ""));
    reader.readAsText(f);
  }

  if (!open) {
    return (
      <div className="no-print" style={{ marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          Import a list of teachers
        </button>
      </div>
    );
  }

  if (needsCampusChoice) {
    return (
      <div className="notice no-print">
        <b>Choose a campus first.</b>
        <div style={{ marginTop: 4 }}>
          An import writes teachers onto one campus&rsquo;s roll, so pick the campus above
          before pasting a list.
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const counts = {
    new: parsed?.rows.filter((r) => r.verdict === "new").length || 0,
    onRoll: parsed?.rows.filter((r) => r.verdict === "already-on-roll").length || 0,
    dup: parsed?.rows.filter((r) => r.verdict === "duplicate-in-file").length || 0,
    bad: parsed?.rows.filter((r) => r.verdict === "invalid").length || 0,
  };

  return (
    <div className="card no-print" style={{ marginBottom: 12 }}>
      <div className="card-h">
        <h2>Import teachers — {campusName}</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setMsg(null); }}>Close</button>
      </div>

      <div className="imp-help">
        Paste straight from Excel, or choose a CSV file. One teacher per line:
        <b> name, subjects, employee code</b>. Subjects go in one cell separated by
        semicolons. A heading row is optional and the column order does not matter.
        Only the name is required.
        <div style={{ marginTop: 6 }}>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE)}`}
            download="teacher-import-template.csv"
          >Download a template</a>
        </div>
      </div>

      <div className="row" style={{ margin: "12px 0 8px", alignItems: "center" }}>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={(e) => loadFile(e.target.files?.[0])}
          style={{ fontSize: 13 }}
        />
      </div>

      <textarea
        className="input"
        rows={7}
        value={text}
        onChange={(e) => { setText(e.target.value); setMsg(null); }}
        placeholder={"Anita Sharma, Maths;Science, KV-1042\nR. Venkatesh, English, KV-1043"}
        style={{ fontFamily: "var(--font-body)", fontSize: 13.5 }}
      />

      {parsed && parsed.rows.length > 0 && (
        <>
          <div className="imp-sum">
            <b>{counts.new}</b> to add
            {counts.onRoll > 0 && <> · {counts.onRoll} already on the roll</>}
            {counts.dup > 0 && <> · {counts.dup} repeated</>}
            {counts.bad > 0 && <> · {counts.bad} unreadable</>}
          </div>

          <div className="scroll-x">
            <table className="imp-t">
              <thead>
                <tr>
                  <th>Line</th><th>Name</th><th>Subjects</th><th>Code</th><th>What happens</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((r) => (
                  <tr key={r.line} className={r.verdict === "new" ? "" : "imp-skip"}>
                    <td>{r.line}</td>
                    <td>{r.name || <span className="muted">—</span>}</td>
                    <td>{r.subjects.join(", ") || <span className="muted">—</span>}</td>
                    <td>{r.employeeCode || <span className="muted">—</span>}</td>
                    <td>
                      {VERDICT_LABEL[r.verdict]}
                      {r.note && <div className="imp-note">{r.note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {msg?.error && <div className="err" style={{ marginTop: 10 }}>{msg.error}</div>}
      {msg?.ok && <div className="ok" style={{ marginTop: 10 }}>{msg.ok}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button
          className="btn btn-accent"
          disabled={busy || !parsed?.importable.length}
          onClick={run}
        >
          {busy ? "Adding…"
            : parsed?.importable.length
              ? `Add ${parsed.importable.length} teacher${parsed.importable.length === 1 ? "" : "s"}`
              : "Nothing to add yet"}
        </button>
        {text && (
          <button className="btn btn-ghost" onClick={() => { setText(""); setMsg(null); if (fileRef.current) fileRef.current.value = ""; }}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
