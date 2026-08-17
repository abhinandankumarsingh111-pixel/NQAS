"use client";
import { useState } from "react";
import RemarkComposer from "./RemarkComposer";

const KIND_LABEL: Record<string, string> = {
  complaint: "Complaint", appreciation: "Appreciation", observation: "Observation",
};

/**
 * Comments on a verification. The author chooses the subject:
 *
 *   About the teacher   -> writes onto that teacher's permanent record,
 *                          pre-linked to this report. Never visible to the
 *                          coordinator who filed it.
 *   To the coordinator  -> feedback on verification quality, visible to the
 *                          coordinator concerned. Otherwise it isn't feedback.
 *
 * Both are the same append-only `remarks` row; only `target` differs, and
 * row-level security enforces who can read which.
 */
export default function ReportComments({
  reportId, campusId, facultyId, teacherName, coordinatorId, coordinatorName,
  canComment, isOwnReport, comments,
}: {
  reportId: string; campusId: string; facultyId: string | null;
  teacherName: string; coordinatorId: string | null; coordinatorName: string;
  canComment: boolean; isOwnReport: boolean; comments: Record<string, unknown>[];
}) {
  const [target, setTarget] = useState<"faculty" | "coordinator">("faculty");

  const visible = comments.filter((c) => String(c.target) === "faculty" || String(c.target) === "coordinator");

  return (
    <div className="card no-print" style={{ marginTop: 14 }}>
      <div className="card-h"><h2>Comments</h2></div>

      {visible.length === 0 && (
        <div className="muted" style={{ fontSize: 13 }}>
          {isOwnReport && !canComment
            ? "No feedback has been left on this verification."
            : "No comments yet."}
        </div>
      )}

      {visible.map((c) => (
        <div key={String(c.id)} className={`tl tl-remark tl-${String(c.kind)}`} style={{ borderBottom: "none" }}>
          <div className="tl-date">{String(c.occurred_on)}</div>
          <div className="tl-body">
            <b>{KIND_LABEL[String(c.kind)] || String(c.kind)}</b>
            <span className="muted" style={{ fontSize: 12 }}>
              {" "}— about {String(c.subject_name)} · {String(c.author_name)}, {String(c.author_role)}
            </span>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, whiteSpace: "pre-wrap" }}>{String(c.body)}</p>
          </div>
        </div>
      ))}

      {canComment && (
        <div style={{ marginTop: visible.length ? 14 : 10 }}>
          <div className="kindpick" style={{ marginBottom: 10 }}>
            <button type="button" className={`kind ${target === "faculty" ? "on kind-observation" : ""}`}
              onClick={() => setTarget("faculty")} disabled={!facultyId}>
              About {teacherName || "the teacher"}
            </button>
            <button type="button" className={`kind ${target === "coordinator" ? "on kind-observation" : ""}`}
              onClick={() => setTarget("coordinator")}>
              To {coordinatorName || "the coordinator"}
            </button>
          </div>

          <div className="muted" style={{ fontSize: 11.5, marginBottom: 10, lineHeight: 1.55 }}>
            {target === "faculty"
              ? !facultyId
                ? "This verification predates the faculty list, so it cannot be attached to a teacher record. Leave feedback for the coordinator instead."
                : `Goes onto ${teacherName}'s permanent record, linked to this verification. Not visible to the coordinator.`
              : `Visible to ${coordinatorName}. Feedback on how the verification was carried out, not about the teacher.`}
          </div>

          {(target === "coordinator" || facultyId) && (
            <RemarkComposer
              key={target}
              compact
              reportId={reportId}
              campusId={campusId}
              facultyId={target === "faculty" ? facultyId! : undefined}
              coordinatorId={target === "coordinator" ? coordinatorId ?? undefined : undefined}
              facultyName={target === "faculty" ? teacherName : coordinatorName}
            />
          )}
        </div>
      )}
    </div>
  );
}
