"use client";
import { useFormState, useFormStatus } from "react-dom";
import { loginAction } from "@/actions";

function SubmitBtn({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return <button className="btn btn-primary" disabled={pending}>{pending ? busy : label}</button>;
}

export default function LoginPage() {
  const [state, action] = useFormState(loginAction, null as { error?: string } | null);
  return (
    <div className="shell">
      <div className="center">
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 13, letterSpacing: 2, color: "var(--teal)", fontWeight: 700 }}>NQAS</div>
          <div style={{ fontFamily: "Georgia, serif", color: "var(--navy)", fontSize: 22, fontWeight: 700 }}>
            Notebook Quality Assurance System
          </div>
        </div>
        <form action={action} className="card">
          <div className="card-h"><h2>Sign in</h2></div>
          <div className="field"><label className="label">Login ID</label><input className="input" name="loginId" autoComplete="username" /></div>
          <div className="field"><label className="label">Password</label><input className="input" name="password" type="password" autoComplete="current-password" /></div>
          {state?.error && <div className="err">{state.error}</div>}
          <SubmitBtn label="Sign in" busy="Signing in…" />
        </form>
      </div>
    </div>
  );
}
