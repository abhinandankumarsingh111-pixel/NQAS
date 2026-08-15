"use client";
import { useRouter } from "next/navigation";

interface Campus { id: string; name: string }

// A dropdown that filters a page by campus via the URL (?campus=<id>).
// Selecting "All Campuses" navigates back to the plain basePath. Preserves an
// existing ?month= filter (if the page has one) so the two filters compose.
export default function CampusSelect({
  campuses, value, month, basePath,
}: { campuses: Campus[]; value: string | null; month?: string | null; basePath: string }) {
  const router = useRouter();
  const buildUrl = (campusId: string) => {
    const params = new URLSearchParams();
    if (campusId !== "all") params.set("campus", campusId);
    if (month) params.set("month", month);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <select
      className="input"
      style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
      value={value || "all"}
      onChange={(e) => router.push(buildUrl(e.target.value))}
    >
      <option value="all">All Campuses</option>
      {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}
