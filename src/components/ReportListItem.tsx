"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { tagColor } from "@/lib/observations";
import { deleteReportAction } from "@/actions";

export interface ReportRow {
  id: string;
  subject: string;
  class: string;
  teacher: string;
  campusName: string;
  date: string;
  coordinator_name: string;
  sample_size: number;
  worst: string;
}

// One report line. If canDelete (owner only), shows a Delete button with a confirm step.
export default function ReportListItem({ r, canDelete }: { r: ReportRow; canDelete: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    setBusy(true);
    const res = await deleteReportAction(r.id);
    setBusy(false);
    if (!res.ok) { alert(res.error || "Could not delete the report."); setConfirming(false); return; }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid var(--line-soft)", padding: "11px 2px" }}>
      <Link href={`/reports/${r.id}`} style={{ textDecoration: "none", color: "inherit", flex: 1, minWidth: 200 }}>
        <b style={{ color: "var(--navy)", fontSize: 14 }}>{r.subject} ({r.class})</b>
        <span className="muted"> · {r.teacher}</span>
        <div className="muted" style={{ fontSize: 12 }}>
          {r.campusName} · {r.date} · by {r.coordinator_name} · {r.sample_size} sample{r.sample_size > 1 ? "s" : ""}
        </div>
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="band" style={{ background: tagColor(r.worst) }}>{r.worst}</span>
        {canDelete && !confirming && (
          <button className="btn btn-danger btn-sm no-print" onClick={() => setConfirming(true)}>Delete</button>
        )}
        {canDelete && confirming && (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--red)" }}>Delete this report?</span>
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={handleDelete}>{busy ? "…" : "Yes"}</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirming(false)}>No</button>
          </span>
        )}
      </div>
    </div>
  );
}
