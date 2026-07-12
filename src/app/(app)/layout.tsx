import { redirect } from "next/navigation";
import Link from "next/link";
import { getProfile } from "@/lib/supabase/server";
import { logoutAction } from "@/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getProfile();
  if (!user || !profile) redirect("/login");

  const nav: { href: string; label: string }[] = [];
  if (profile.role === "owner") {
    nav.push({ href: "/dashboard", label: "Dashboard" }, { href: "/admin", label: "Admin" });
  } else if (profile.role === "management") {
    nav.push({ href: "/dashboard", label: "Dashboard" });
  } else {
    nav.push({ href: "/verify", label: "New Verification" }, { href: "/reports", label: "My Reports" });
  }

  return (
    <div className="shell">
      <div className="topbar no-print">
        <div>
          <span className="brand">NQAS</span>
          <span className="muted" style={{ marginLeft: 8 }}>Notebook Quality Assurance System</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="muted">{profile.name} · <b style={{ color: "var(--teal)" }}>{profile.role}</b></span>
          <form action={logoutAction}><button className="btn btn-ghost btn-sm">Sign out</button></form>
        </div>
      </div>
      <nav className="tabs no-print">
        {nav.map((n) => <Link key={n.href} href={n.href} className="tab">{n.label}</Link>)}
      </nav>
      {children}
    </div>
  );
}
