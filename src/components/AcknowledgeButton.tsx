"use client";
import { useState, useTransition } from "react";
import { acknowledgeRemarkAction } from "@/actions";

/**
 * Records that a remark was discussed with the teacher. A record used in an
 * employment decision that the teacher was never shown is the weakest possible
 * position to defend, so an undiscussed remark stays visibly undiscussed.
 */
export default function AcknowledgeButton({ remarkId }: { remarkId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <span className="no-print">
      <button
        className="btn btn-ghost btn-sm"
        disabled={pending}
        onClick={() => start(async () => {
          const res = await acknowledgeRemarkAction(remarkId);
          if (!res.ok) setErr(res.error || "Could not save.");
        })}
      >
        {pending ? "Saving…" : "Mark as discussed with faculty"}
      </button>
      {err && <span className="err" style={{ marginLeft: 8 }}>{err}</span>}
    </span>
  );
}
