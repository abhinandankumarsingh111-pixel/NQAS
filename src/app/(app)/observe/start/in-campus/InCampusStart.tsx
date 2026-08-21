"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { startInCampusAction } from "@/actions/observations";

export interface TeacherOption {
  id: string; name: string; subject: string;
  lastClass: string; lastSubject: string;
}

export default function InCampusStart({ teachers }: { teachers: TeacherOption[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<TeacherOption | null>(null);
  const [cls, setCls] = useState("");
  const [section, setSection] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = n ? teachers.filter((t) => t.name.toLowerCase().includes(n)) : teachers;
    return list.slice(0, 40);
  }, [q, teachers]);

  function choose(t: TeacherOption) {
    setPicked(t);
    // Pre-fill from what this teacher was last verified teaching. A guess the
    // principal can see and correct beats an empty field they must type into
    // while standing at the back of a classroom.
    const parts = t.lastClass.split(/[-\s]+/).filter(Boolean);
    setCls(parts[0] || "");
    setSection(parts[1] || "");
    setSubject(t.lastSubject || t.subject || "");
  }

  async function start() {
    if (!picked) return;
    setBusy(true); setErr(null);
    const res = await startInCampusAction({
      facultyId: picked.id, teacherName: picked.name,
      className: cls, section, subject, topic,
    });
    setBusy(false);
    if (!res.ok || !res.id) { setErr(res.error || "Could not start."); return; }
    router.push(`/observe/run/in_campus/${res.id}`);
  }

  return (
    <div className="obs">
      <div className="no-print" style={{ marginBottom: 10 }}>
        <Link href="/observe" className="muted" style={{ fontSize: 13 }}>&larr; Class Observation</Link>
      </div>

      <div className="obs-card">
        <div className="obs-count">IN-CAMPUS</div>
        <h2 className="obs-name">{picked ? picked.name : "Who are you observing?"}</h2>

        {!picked ? (
          <>
            <input className="obs-input" value={q} autoComplete="off"
              placeholder="Search teachers on this campus"
              onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 11 }} />
            {teachers.length === 0 ? (
              <div className="muted" style={{ fontSize: 13.5 }}>
                No active teachers on this campus yet. They are added when a
                coordinator files their first notebook verification.
              </div>
            ) : (
              <div className="obs-teachers">
                {matches.map((t) => (
                  <button key={t.id} type="button" className="obs-teacher" onClick={() => choose(t)}>
                    <span>{t.name}</span>
                    <small>{t.lastClass || t.subject || ""}</small>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <button type="button" className="obs-addremark" style={{ marginTop: 0 }}
              onClick={() => setPicked(null)}>Change teacher</button>

            <div className="obs-field">
              <label>Class</label>
              <input className="obs-input" value={cls} placeholder="e.g. VIII"
                onChange={(e) => setCls(e.target.value)} />
            </div>
            <div className="obs-field">
              <label>Section</label>
              <input className="obs-input" value={section} placeholder="e.g. A"
                onChange={(e) => setSection(e.target.value)} />
            </div>
            <div className="obs-field">
              <label>Subject</label>
              <input className="obs-input" value={subject} placeholder="e.g. Chemistry"
                onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="obs-field">
              <label>Topic <span style={{ textTransform: "none", fontWeight: 400 }}>(optional)</span></label>
              <input className="obs-input" value={topic} placeholder="What is being taught"
                onChange={(e) => setTopic(e.target.value)} />
            </div>

            {err && <div className="obs-err">{err}</div>}
            <button type="button" className="obs-start" disabled={busy} onClick={start}>
              {busy ? "Starting…" : "Start Observation"}
            </button>
            <p className="obs-locknote">
              Saved from the first tap. If you are interrupted, reopen this page and continue.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
