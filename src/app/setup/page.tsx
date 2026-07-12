"use client";
import { useFormState, useFormStatus } from "react-dom";
import { setupAction } from "@/actions";

function SubmitBtn() {
  const { pending } = useFormStatus();
  return <button className="btn btn-accent" disabled={pending}>{pending ? "Creating…" : "Create Owner Account →"}</button>;
}

export default function SetupPage() {
  const [state, action] = useFormState(setupAction, null as { error?: string } | null);
  return (
    <div className="shell">
      <div className="center">
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 13, letterSpacing: 2, color: "var(--teal)", fontWeight: 700 }}>NQAS</div>
          <div style={{ fontFamily: "Georgia, serif", color: "var(--navy)", fontSize: 22, fontWeight: 700 }}>First-time setup</div>
        </div>
        <form action={action} className="card">
          <div className="card-h"><h2>Create the Owner account</h2></div>
          <p className="muted" style={{ marginTop: 0 }}>
            This account controls everything — creating Management and Coordinator IDs, campuses, and viewing all data. You only do this once.
          </p>
          <div className="field"><label className="label">Your Name</label><input className="input" name="name" placeholder="e.g. Abhinandan Singh" /></div>
          <div className="field"><label className="label">Owner Login ID</label><input className="input" name="loginId" placeholder="e.g. abhi.owner" /></div>
          <div className="field"><label className="label">Password (min 6 characters)</label><input className="input" name="password" type="password" /></div>
          {state?.error && <div className="err">{state.error}</div>}
          <SubmitBtn />
        </form>
      </div>
    </div>
  );
}
