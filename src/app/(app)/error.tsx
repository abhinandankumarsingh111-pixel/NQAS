"use client";
// Shown whenever a page in the app throws, instead of a raw crash screen.
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card" style={{ maxWidth: 480, margin: "40px auto", textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)", marginBottom: 8 }}>
        Something went wrong
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        The page could not be loaded. This is sometimes temporary — please try again.
        If it keeps happening, sign out and sign back in.
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => reset()}>Try again</button>
        <a className="btn btn-ghost" href="/login">Sign in again</a>
      </div>
    </div>
  );
}
