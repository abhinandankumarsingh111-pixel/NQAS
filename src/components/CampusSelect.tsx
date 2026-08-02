"use client";
import { useRouter } from "next/navigation";

interface Campus { id: string; name: string }

// A dropdown that filters a page by campus via the URL (?campus=<id>).
// Selecting "All Campuses" navigates back to the plain basePath.
export default function CampusSelect({ campuses, value, basePath }: { campuses: Campus[]; value: string | null; basePath: string }) {
  const router = useRouter();
  return (
    <select
      className="input"
      style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
      value={value || "all"}
      onChange={(e) => {
        const v = e.target.value;
        router.push(v === "all" ? basePath : `${basePath}?campus=${v}`);
      }}
    >
      <option value="all">All Campuses</option>
      {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}
