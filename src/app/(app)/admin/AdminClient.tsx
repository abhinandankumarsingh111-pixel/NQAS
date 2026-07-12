"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createUserAction, addCampusAction, deleteUserAction } from "@/actions";

interface Campus { id: string; name: string }
interface UserRow { id: string; name: string; role: string; login_id: string | null; campus_id: string | null }

function SubmitBtn({ className, label, busy }: { className: string; label: string; busy: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{pending ? busy : label}</button>;
}

export default function AdminClient({ campuses, users, myId }: { campuses: Campus[]; users: UserRow[]; myId: string }) {
  const [tab, setTab] = useState<"users" | "campuses">("users");
  const [userState, userAction] = useFormState(createUserAction, null as { error?: string; ok?: string } | null);
  const [campusState, campusAction] = useFormState(addCampusAction, null as { error?: string; ok?: string } | null);
  const [role, setRole] = useState("coordinator");
  const campusName = (id: string | null) => campuses.find((c) => c.id === id)?.name;

  return (
    <div>
      <div className="tabs">
        <button className={`tab ${tab === "users" ? "on" : ""}`} onClick={() => setTab("users")}>User IDs</button>
        <button className={`tab ${tab === "campuses" ? "on" : ""}`} onClick={() => setTab("campuses")}>Campuses</button>
      </div>

      {tab === "users" && (
        <>
          <form action={userAction} className="card">
            <div className="card-h"><h2>Create new ID</h2></div>
            <div className="row">
              <div className="grow"><label className="label">Full Name</label><input className="input" name="name" /></div>
              <div className="grow"><label className="label">Login ID</label><input className="input" name="loginId" placeholder="e.g. coord.rourkela" /></div>
              <div className="grow">
                <label className="label">Role</label>
                <select className="input" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="coordinator">Coordinator</option>
                  <option value="management">Management</option>
                </select>
              </div>
              {role === "coordinator" && (
                <div className="grow">
                  <label className="label">Campus (access limited to this)</label>
                  <select className="input" name="campusId" defaultValue={campuses[0]?.id}>
                    {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="grow"><label className="label">Initial Password (min 6)</label><input className="input" name="password" /></div>
            </div>
            {userState?.error && <div className="err">{userState.error}</div>}
            {userState?.ok && <div className="ok">{userState.ok}</div>}
            <SubmitBtn className="btn btn-accent" label="Create ID" busy="Creating…" />
          </form>

          <div className="card">
            <div className="card-h"><h2>Existing IDs ({users.length})</h2></div>
            {users.map((u) => (
              <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--line-soft)", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <b style={{ color: "var(--navy)", fontSize: 14 }}>{u.name}</b> <span className="muted">({u.login_id})</span>
                  <div className="muted" style={{ fontSize: 12 }}>{u.role}{u.campus_id ? ` · ${campusName(u.campus_id)}` : u.role === "management" ? " · all campuses (read)" : " · full control"}</div>
                </div>
                {u.id !== myId && (
                  <form action={async () => { await deleteUserAction(u.id); }}>
                    <button className="btn btn-danger btn-sm">Remove</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "campuses" && (
        <div className="card">
          <div className="card-h"><h2>Campuses</h2></div>
          {campuses.map((c) => <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line-soft)", fontSize: 14 }}>{c.name}</div>)}
          <form action={campusAction} style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input className="input" style={{ flex: 1 }} name="campusName" placeholder="New campus name" />
            <SubmitBtn className="btn btn-ghost" label="Add" busy="Adding…" />
          </form>
          {campusState?.error && <div className="err" style={{ marginTop: 8 }}>{campusState.error}</div>}
          {campusState?.ok && <div className="ok" style={{ marginTop: 8 }}>{campusState.ok}</div>}
        </div>
      )}
    </div>
  );
}
