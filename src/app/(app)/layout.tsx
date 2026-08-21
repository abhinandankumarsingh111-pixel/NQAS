import { redirect } from "next/navigation";
import Link from "next/link";
import { getProfile } from "@/lib/supabase/server";
import { logoutAction } from "@/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getProfile();
  if (!user || !profile) redirect("/login");

  const nav: { href: string; label: string }[] = [];
  if (profile.role === "owner") {
    // Owner sees observations but cannot conduct one — an observation is a
    // judgement made in a room they were not standing in.
    nav.push({ href: "/dashboard", label: "Dashboard" }, { href: "/faculty", label: "Faculty" },
             { href: "/observe", label: "Observations" }, { href: "/admin", label: "Admin" });
  } else if (profile.role === "principal") {
    // Class Observation is the principal's alone (spec 2). Management is
    // deliberately absent from this list, and blocked by RLS besides.
    nav.push({ href: "/dashboard", label: "Dashboard" }, { href: "/faculty", label: "Faculty" },
             { href: "/observe", label: "Class Observation" });
  } else if (profile.role === "management") {
    nav.push({ href: "/dashboard", label: "Dashboard" }, { href: "/faculty", label: "Faculty" });
  } else {
    nav.push({ href: "/verify", label: "New Verification" }, { href: "/reports", label: "My Reports" });
  }

  return (
    <>
      <header className="app-topbar no-print">
        <div className="app-topbar-inner">
          <div className="app-topbar-brand">
            <img src="/logo-symbol.png" alt="" width={32} height={32} />
            <div>
              <span className="app-topbar-name">NQAS</span>
              <span className="app-topbar-sub">Notebook Quality Assurance System</span>
            </div>
          </div>
          <div className="app-topbar-user">
            <span>{profile.name} · <b>{profile.role}</b></span>
            <form action={logoutAction}><button className="btn btn-ghost btn-sm">Sign out</button></form>
          </div>
        </div>
      </header>
      <div className="shell">
        <nav className="tabs no-print">
          {nav.map((n) => <Link key={n.href} href={n.href} className="tab">{n.label}</Link>)}
        </nav>
        {children}
      </div>
      <footer className="app-footer no-print">
        <div className="app-footer-ring"><img src="/logo-symbol.png" alt="" width={26} height={26} /></div>
        <div className="app-footer-brand">Krishna Vikash Group of CBSE Schools</div>
        <div className="app-footer-tagline">Care · Culture · Career</div>
        <p className="app-footer-note">Notebook Quality Assurance System — one verification standard, applied the same way at every campus.</p>
      </footer>
    </>
  );
}
