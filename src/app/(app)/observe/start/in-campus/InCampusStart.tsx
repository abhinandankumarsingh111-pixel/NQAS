"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TeacherPicker, { type Fac } from "@/components/TeacherPicker";
import { startInCampusAction } from "@/actions/observations";

export interface TeacherOption extends Fac {
  /** What this teacher was last verified teaching, used only to pre-fill. */
  lastClass: string;
  lastSubject: string;
}

/**
 * Choosing who is being observed.
 *
 * This uses the SAME picker as notebook verification rather than a list of its
 * own. That matters: the picker already normalises the name, offers an exact
 * match, surfaces near matches, and carries the "different person with the same
 * name" escape hatch. A second, simpler list here would quietly reintroduce the
 * duplicate-teacher problem that picker exists to prevent — and a duplicate is
 * worse in a personnel record than anywhere else, because it splits one
 * teacher's history into two half-empty files.
 *
 * It also means a principal can ADD a teacher. Without that, anyone who has
 * never had a notebook verification filed could not be observed at all, which
 * is exactly backwards: a teacher nobody has checked on is the one most worth
 * walking in to see.
 */
export default function InCampusStart({
  teachers, campusId,
}: { teachers: TeacherOption[]; campusId: string }) {
  const router = useRouter();
  const [list, setList] = useState<TeacherOption[]>(teachers);
  const [facultyId, setFacultyId] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState("");
  const [cls, setCls] = useState("");
  const [section, setSection] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onPick(id: string | null, name: string, picked?: string | null) {
    setFacultyId(id);
    setTeacherName(name);
    setErr(null);
    if (!id) { setCls(""); setSection(""); setSubject(""); return; }

    const known = list.find((t) => t.id === id);
    if (!known) {
      // Newly created by the picker. Keep it in the local list so the label
      // renders, but there is nothing to pre-fill from.
      setList((l) => [...l, { id, name, subject: picked ?? null, lastClass: "", lastSubject: "" }]);
      setSubject(picked || "");
      return;
    }
    // Pre-fill from what this teacher was last verified teaching. A guess the
    // principal can see and correct beats an empty field they have to type into
    // while standing at the back of a classroom.
    const parts = known.lastClass.split(/[-\s]+/).filter(Boolean);
    setCls(parts[0] || "");
    setSection(parts[1] || "");
    setSubject(known.lastSubject || known.subject || picked || "");
  }

  async function start() {
    if (!facultyId) return;
    setBusy(true); setErr(null);
    const res = await startInCampusAction({
      facultyId, teacherName, className: cls, section, subject, topic,
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
        <h2 className="obs-name">Who are you observing?</h2>

        <TeacherPicker
          faculty={list} campusId={campusId}
          valueId={facultyId} valueName={teacherName}
          onPick={onPick}
        />

        {!facultyId && (
          <div className="muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
            {list.length === 0
              ? "No teachers on this campus yet. Type a name to add the first one."
              : "Not on the list? Type their name and add them — a teacher who has never had a notebook verification can still be observed."}
          </div>
        )}

        {facultyId && (
          <>
            <div className="obs-field" style={{ marginTop: 16 }}>
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
