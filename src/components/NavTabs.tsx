"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The main navigation, with the current section actually marked.
 *
 * The `.tab.on` style has existed since the app was built but nothing ever
 * applied it, so every tab rendered identically and there was no way to tell
 * from the chrome which page you were on. Knowing where you are is the first
 * thing navigation owes you, so this marks it — and marks it three ways
 * (fill, weight, and aria-current) rather than by colour alone.
 */
export default function NavTabs({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname() || "";
  // A section owns its sub-pages: /faculty/<id> is still "Faculty".
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="tabs no-print" aria-label="Sections">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`tab${active(n.href) ? " on" : ""}`}
          aria-current={active(n.href) ? "page" : undefined}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
