"use client";
import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createUserAction, addCampusAction, deleteUserAction,
  updateUserAction, resetPasswordAction, updateCampusAction,
} from "@/actions";

interface Campus { id: string; name: string; code?: string | null }
interface UserRow { id: string; name: string; role: string; login_id: string | null; campus_id: string | null }

function SubmitBtn({ className, label, busy }: { className: string; label: string; busy: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{pending ? busy : label}</button>;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner", management: "Management", principal: "Principal", coordinator: "Coordinator",
};

/**
 * Edit an account: name, login ID, and — on other people's accounts — role and
 * campus.
 *
 * The owner's own row deliberately offers name and password but not role or
 * campus. Demoting yourself is the one change nothing inside the product can
 * undo, because there would be no owner left to undo it with.
 */
function EditUserRow({ u, campuses, isSelf, onDone }: {
  u: UserRow; campuses: Campus[]; isSelf: boolean; onDone: () => void;
}) {
  const [state, action] = useFormState(updateUserAction, null as { error?: string; ok?: string } | null);
  const [role, setRole] = useState(u.role === "owner" ? "coordinator" : u.role);
  const [loginId, setLoginId] = useState(u.login_id || "");
  const needsCampus = role === "coordinator" || role === "principal";
  const idChanged = loginId.trim().toLowerCase() !== (u.login_id || "");

  useEffect(() => {
    if (state?.ok && !state.error) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="adm-edit">
      <input type="hidden" name="userId" value={u.id} />
      <div className="row" style={{ marginBottom: 8 }}>
        <div className="grow">
          <label className="label">Full name</label>
          <input className="input" name="name" defaultValue={u.name} />
        </div>
        <div className="grow">
          <label className="label">Login ID</label>
          <input
            className="input" name="loginId" value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoCapitalize="off" autoCorrect="off" spellCheck={false}
          />
        </div>
      </div>

      {idChanged && (
        <div className="notice" style={{ marginBottom: 8 }}>
          <b>This changes how {isSelf ? "you" : u.name.split(" ")[0]} sign{isSelf ? "" : "s"} in.</b>
          <div style={{ marginTop: 3 }}>
            The old ID <b>{u.login_id}</b> will stop working immediately. The password is unchanged.
          </div>
        </div>
      )}

      {isSelf ? (
        <div className="muted" style={{ fontSize: 12, marginBottom: 8, lineHeight: 1.55 }}>
          You are the owner. Role and campus are not editable on your own account —
          there would be no owner left to change them back.
        </div>
      ) : (
        <div className="row" style={{ marginBottom: 8 }}>
          <div className="grow">
            <label className="label">Role</label>
            <select className="input" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="coordinator">Coordinator</option>
              <option value="principal">Principal (one campus)</option>
              <option value="management">Management (all campuses)</option>
            </select>
          </div>
          {needsCampus && (
            <div className="grow">
              <label className="label">Campus</label>
              <select className="input" name="campusId" defaultValue={u.campus_id || campuses[0]?.id}>
                {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {state?.error && <div className="err">{state.error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <SubmitBtn className="btn btn-accent btn-sm" label="Save" busy="Saving…" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

/**
 * Set a password.
 *
 * Not "send a reset link" — login IDs are synthetic addresses at an internal
 * domain, so there is no inbox for one to arrive in. The owner sets it and
 * passes it on, which is how every account here was made in the first place.
 */
function PasswordRow({ u, onDone }: { u: UserRow; onDone: () => void }) {
  const [state, action] = useFormState(resetPasswordAction, null as { error?: string; ok?: string } | null);
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="adm-edit">
      <input type="hidden" name="userId" value={u.id} />
      <div className="row" style={{ marginBottom: 8 }}>
        <div className="grow">
          <label className="label">New password (min 6)</label>
          <input className="input" name="password" type={show ? "text" : "password"} autoComplete="new-password" />
        </div>
        <div className="grow">
          <label className="label">Type it again</label>
          <input className="input" name="confirm" type={show ? "text" : "password"} autoComplete="new-password" />
        </div>
      </div>
      <label style={{ fontSize: 12, color: "var(--sub)", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Show what I am typing
      </label>
      {state?.error && <div className="err">{state.error}</div>}
      {state?.ok && <div className="ok">{state.ok}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <SubmitBtn className="btn btn-accent btn-sm" label="Set password" busy="Setting…" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Close</button>
      </div>
    </form>
  );
}

function EditCampusRow({ c, onDone }: { c: Campus; onDone: () => void }) {
  const [state, action] = useFormState(updateCampusAction, null as { error?: string; ok?: string } | null);

  useEffect(() => {
    if (state?.ok && !state.error) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="adm-edit">
      <input type="hidden" name="campusId" value={c.id} />
      <div className="row" style={{ marginBottom: 8 }}>
        <div className="grow">
          <label className="label">Campus name</label>
          <input className="input" name="campusName" defaultValue={c.name} />
        </div>
        <div style={{ flex: "0 0 130px" }}>
          <label className="label">Code</label>
          <input className="input" name="campusCode" defaultValue={c.code || ""} style={{ textTransform: "uppercase" }} />
        </div>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 8, lineHeight: 1.5 }}>
        Renaming a campus changes it everywhere at once, including on reports already
        filed. Nothing is re-filed and no record moves — only the name shown.
      </div>
      {state?.error && <div className="err">{state.error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <SubmitBtn className="btn btn-accent btn-sm" label="Save" busy="Saving…" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

export default function AdminClient({ campuses, users, myId }: { campuses: Campus[]; users: UserRow[]; myId: string }) {
  const [tab, setTab] = useState<"users" | "campuses">("users");
  const [userState, userAction] = useFormState(createUserAction, null as { error?: string; ok?: string } | null);
  const [campusState, campusAction] = useFormState(addCampusAction, null as { error?: string; ok?: string } | null);
  const [role, setRole] = useState("coordinator");
  const [showPw, setShowPw] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pwId, setPwId] = useState<string | null>(null);
  const [editingCampus, setEditingCampus] = useState<string | null>(null);
  const campusName = (id: string | null) => campuses.find((c) => c.id === id)?.name;

  // Coordinator and Principal are both campus-locked roles.
  const needsCampus = role === "coordinator" || role === "principal";

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
                  <option value="principal">Principal (one campus)</option>
                  <option value="management">Management (all campuses)</option>
                </select>
              </div>
              {needsCampus && (
                <div className="grow">
                  <label className="label">Campus (access limited to this)</label>
                  <select className="input" name="campusId" defaultValue={campuses[0]?.id}>
                    {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="grow">
                <label className="label">Initial Password (min 6)</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="input" name="password" type={showPw ? "text" : "password"} style={{ flex: 1 }} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPw(!showPw)}>{showPw ? "Hide" : "Show"}</button>
                </div>
              </div>
            </div>
            {userState?.error && <div className="err">{userState.error}</div>}
            {userState?.ok && <div className="ok">{userState.ok}</div>}
            <SubmitBtn className="btn btn-accent" label="Create ID" busy="Creating…" />
          </form>

          <div className="card">
            <div className="card-h"><h2>Existing IDs ({users.length})</h2></div>
            {users.map((u) => {
              const isSelf = u.id === myId;
              const busyHere = editingId === u.id || pwId === u.id;
              return (
                <div key={u.id} style={{ borderBottom: "1px solid var(--line-soft)", padding: "9px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <b style={{ color: "var(--navy)", fontSize: 14 }}>{u.name}</b> <span className="muted">({u.login_id})</span>
                      {isSelf && <span className="fac-chip" style={{ marginLeft: 8 }}>You</span>}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {ROLE_LABEL[u.role] || u.role}
                        {u.campus_id ? ` · ${campusName(u.campus_id)}` : u.role === "management" ? " · all campuses (read)" : " · full control"}
                      </div>
                    </div>
                    {!busyHere && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(u.id); setPwId(null); }}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setPwId(u.id); setEditingId(null); }}>Password</button>
                        {!isSelf && (
                          <form action={async () => { await deleteUserAction(u.id); }}>
                            <button className="btn btn-danger btn-sm">Remove</button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                  {editingId === u.id && (
                    <EditUserRow u={u} campuses={campuses} isSelf={isSelf} onDone={() => setEditingId(null)} />
                  )}
                  {pwId === u.id && <PasswordRow u={u} onDone={() => setPwId(null)} />}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "campuses" && (
        <div className="card">
          <div className="card-h"><h2>Campuses <span className="muted" style={{ fontWeight: 500 }}>({campuses.length})</span></h2></div>
          {campuses.map((c) => (
            <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line-soft)" }}>
              <div style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span>{c.name}</span>
                {c.code && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
                    color: "var(--sub)", background: "var(--chip)", border: "1px solid var(--line-soft)",
                    borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap",
                  }}>{c.code}</span>
                )}
                {editingCampus !== c.id && (
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }}
                    onClick={() => setEditingCampus(c.id)}>Edit</button>
                )}
              </div>
              {editingCampus === c.id && <EditCampusRow c={c} onDone={() => setEditingCampus(null)} />}
            </div>
          ))}
          <form action={campusAction} style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <input className="input" style={{ flex: "1 1 200px" }} name="campusName" placeholder="New campus name" />
            <input className="input" style={{ flex: "0 0 120px", textTransform: "uppercase" }} name="campusCode" placeholder="Code" />
            <SubmitBtn className="btn btn-ghost" label="Add" busy="Adding…" />
          </form>
          {campusState?.error && <div className="err" style={{ marginTop: 8 }}>{campusState.error}</div>}
          {campusState?.ok && <div className="ok" style={{ marginTop: 8 }}>{campusState.ok}</div>}
        </div>
      )}
    </div>
  );
}
