"use client";
import { useRouter } from "next/navigation";

export interface MonthOption { value: string; label: string; count: number }

// A dropdown that filters a page by month via the URL (?month=YYYY-MM, or ?month=all).
// The chosen month is always written explicitly to the URL (including "all") so a
// user's "All time" choice sticks instead of snapping back to the smart default.
export default function MonthSelect({
  months, value, campus, basePath,
}: { months: MonthOption[]; value: string; campus?: string | null; basePath: string }) {
  const router = useRouter();
  const buildUrl = (month: string) => {
    const params = new URLSearchParams();
    if (campus) params.set("campus", campus);
    params.set("month", month);
    return `${basePath}?${params.toString()}`;
  };
  return (
    <select
      className="input"
      style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
      value={value}
      onChange={(e) => router.push(buildUrl(e.target.value))}
    >
      <option value="all">All time</option>
      {months.map((m) => <option key={m.value} value={m.value}>{m.label} ({m.count})</option>)}
    </select>
  );
}
