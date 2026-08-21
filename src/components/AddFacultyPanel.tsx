"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import TeacherPicker, { type Fac } from "@/components/TeacherPicker";

/**
 * Adding a teacher from the faculty directory.
 *
 * Until now the only way a teacher could come into existence was a coordinator
 * filing a notebook verification for them. That made the record depend on
 * whoever happened to be checked first, and left leadership unable to open a
 * file on a teacher at all — including the ones most worth opening a file on.
 *
 * Deliberately the SAME picker as verification and observation, so the
 * duplicate-name defences apply here too. A duplicate is worse in a personnel
 * record than anywhere else: it splits one teacher's history into two
 * half-empty files, and a review that reads only one of them reads a lie.
 */
export default function AddFacultyPanel({
  faculty, campusId, campusName, needsCampusChoice,
}: {
  faculty: Fac[];
  campusId: string | null;
  campusName: string;
  /** True for org-wide roles that have not narrowed to one campus yet. */
  needsCampusChoice: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (!open) {
    return (
      <div className="no-print" style={{ marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          + Add a teacher
        </button>
      </div>
    );
  }

  if (needsCampusChoice || !campusId) {
    return (
      <div className="notice no-print">
        <b>Choose a campus first.</b> A teacher belongs to one campus, so pick it
        above and then add them.
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card no-print" style={{ marginBottom: 12 }}>
      <div className="card-h"><h2>Add a teacher &mdash; {campusName}</h2></div>
      <TeacherPicker
        faculty={faculty} campusId={campusId}
        valueId={null} valueName={name}
        onPick={(id, picked) => {
          if (!id) { setName(picked); return; }
          // Whether they already existed or were just created, the useful next
          // screen is the same one: their record.
          router.push(`/faculty/${id}`);
        }}
      />
      <div className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.6 }}>
        Type the name. If they are already on the list you will be offered their
        existing record rather than a second one.
      </div>
      <div style={{ marginTop: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
