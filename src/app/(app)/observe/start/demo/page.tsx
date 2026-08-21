"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { startDemoAction } from "@/actions/observations";

/**
 * Demo class start.
 *
 * A candidate is a stranger to the system, so there is nothing to look up and
 * nothing to pre-fill. Three fields, then straight into the rubric.
 */
export default function DemoStart() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [demoClass, setDemoClass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setBusy(true); setErr(null);
    const res = await startDemoAction({ candidateName: name, subject, demoClass });
    setBusy(false);
    if (!res.ok || !res.id) { setErr(res.error || "Could not start."); return; }
    router.push(`/observe/run/demo/${res.id}`);
  }

  return (
    <div className="obs">
      <div className="no-print" style={{ marginBottom: 10 }}>
        <Link href="/observe" className="muted" style={{ fontSize: 13 }}>&larr; Class Observation</Link>
      </div>

      <div className="obs-card">
        <div className="obs-count">DEMO CLASS</div>
        <h2 className="obs-name">Who is giving the demo?</h2>
        <p className="obs-prompt">
          This is kept in the hiring file. It never becomes part of a serving
          teacher&rsquo;s record.
        </p>

        <div className="obs-field">
          <label>Candidate name</label>
          <input className="obs-input" value={name} autoComplete="off"
            placeholder="Full name" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="obs-field">
          <label>Subject</label>
          <input className="obs-input" value={subject} autoComplete="off"
            placeholder="e.g. Physics" onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="obs-field">
          <label>Demo class / section</label>
          <input className="obs-input" value={demoClass} autoComplete="off"
            placeholder="e.g. IX-B" onChange={(e) => setDemoClass(e.target.value)} />
        </div>

        {err && <div className="obs-err">{err}</div>}
        <button type="button" className="obs-start" disabled={busy || !name.trim()} onClick={start}>
          {busy ? "Starting…" : "Start Demo Observation"}
        </button>
      </div>
    </div>
  );
}
