"use client";
import { useFormState, useFormStatus } from "react-dom";
import { loginAction } from "@/actions";

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" style={{ width: "100%", textAlign: "center", marginTop: 4 }} disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export default function LoginPage() {
  const [state, action] = useFormState(loginAction, null as { error?: string } | null);
  return (
    <div className="login-page">
      <div className="login-banner">
        <div className="login-watermark" aria-hidden="true" />
        <div className="login-banner-inner">
          <div className="login-ring"><img src="/logo-symbol.png" alt="" width={24} height={24} /></div>
          <h1 className="login-heading">Krishna Vikash Group of CBSE Schools</h1>
          <div className="login-subheading">Notebook Quality Assurance System</div>
          <div className="login-rule" />
          <p className="login-quote">&ldquo;Strengthening academic quality, one notebook at a time.&rdquo;</p>
          <div className="login-tagline">Care · Culture · Career</div>
        </div>
      </div>
      <div className="login-formzone">
        <form action={action} className="login-card">
          <div className="login-microlabel">NQAS</div>
          <h2>Sign in</h2>
          <div className="hint">Use the login ID issued by your campus.</div>
          <div className="fields">
            <div className="field"><label className="label">Login ID</label><input className="input" name="loginId" autoComplete="username" /></div>
            <div className="field"><label className="label">Password</label><input className="input" name="password" type="password" autoComplete="current-password" /></div>
          </div>
          {state?.error && <div className="err">{state.error}</div>}
          <SubmitBtn />
        </form>
      </div>
    </div>
  );
}
