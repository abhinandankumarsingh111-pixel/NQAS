import { redirect } from "next/navigation";
import Link from "next/link";
import { getProfile, createClient } from "@/lib/supabase/server";
import { teacherMetrics, PROVISIONAL_BELOW, type MetricReport } from "@/lib/metrics";
import CampusSelect from "@/components/CampusSelect";
import AddFacultyPanel from "@/components/AddFacultyPanel";

export const dynamic = "force-dynamic";

interface FacultyRow {
  id: string; campus_id: string; name: string;
  subject: string | null; employee_code: string | null; active: boolean; subjects: string[] | null;
}

export default async function FacultyDirectory({
  searchParams,
}: { searchParams: { campus?: string; q?: string; inactive?: string } }) {
  const { profile } = await getProfile();
  if (!profile) redirect("/login");
  // Teacher metrics are leadership-only. Coordinators reach faculty through the
  // verification form picker, never through this record view.
  if (profile.role === "coordinator") redirect("/verify");

  const supabase = createClient();
  const [{ data: faculty }, { data: reports }, { data: campuses }, { data: remarks }] = await Promise.all([
    supabase.from("faculty").select("*").order("name"),
    supabase.from("reports").select("id, faculty_id, campus_id, date, class_band, coordinator_id, coordinator_name, sampling_method, students").is("deleted_at", null),
    supabase.from("campuses").select("*").order("name"),
    supabase.from("remarks").select("id, faculty_id, kind").eq("target", "faculty"),
  ]);

  // Previous names are searchable too — a teacher looked up three years later
  // may well be under the name she had then.
  const q = (searchParams?.q || "").trim();
  let priorMatches: string[] = [];
  if (q) {
    const { data: prior } = await supabase
      .from("faculty_previous_names").select("faculty_id").ilike("previous_name", `%${q}%`);
    priorMatches = (prior || []).map((p: { faculty_id: string }) => p.faculty_id);
  }

  const camps = campuses || [];
  const campusName = (id: string | null) => camps.find((c) => c.id === id)?.name || "—";
  const isCampusLocked = profile.role === "principal";
  const selectedCampusId = !isCampusLocked ? (searchParams?.campus || null) : null;
  const showInactive = searchParams?.inactive === "1";

  const byFaculty = new Map<string, MetricReport[]>();
  for (const r of (reports || []) as (MetricReport & { faculty_id: string | null })[]) {
    if (!r.faculty_id) continue;
    const list = byFaculty.get(r.faculty_id);
    if (list) list.push(r); else byFaculty.set(r.faculty_id, [r]);
  }
  const remarkCount = new Map<string, number>();
  for (const rm of (remarks || []) as { faculty_id: string }[]) {
    remarkCount.set(rm.faculty_id, (remarkCount.get(rm.faculty_id) || 0) + 1);
  }

  // Campus-scoped but NOT search-filtered: this is what the add-a-teacher
  // picker checks against, and it must see everyone to spot a duplicate.
  const campusFaculty = ((faculty || []) as FacultyRow[])
    .filter((f) => !selectedCampusId || f.campus_id === selectedCampusId);

  const rows = campusFaculty
    .filter((f) => (showInactive ? true : f.active))
    .filter((f) => !q
      || f.name.toLowerCase().includes(q.toLowerCase())
      || (f.subject || "").toLowerCase().includes(q.toLowerCase())
      || priorMatches.includes(f.id));

  const enriched = rows.map((f) => {
    const rs = byFaculty.get(f.id) || [];
    return { f, m: teacherMetrics(rs), remarks: remarkCount.get(f.id) || 0 };
  });
  // Most-behind first: this view exists to surface where attention is needed.
  enriched.sort((a, b) => (b.m.behindPct ?? -1) - (a.m.behindPct ?? -1) || a.f.name.localeCompare(b.f.name));

  return (
    <div className="card">
      <div className="card-h">
        <h2>Faculty <span className="muted" style={{ fontWeight: 500 }}>({enriched.length})</span></h2>
        {!isCampusLocked && <CampusSelect campuses={camps} value={selectedCampusId} basePath="/faculty" />}
      </div>

      <AddFacultyPanel
        faculty={campusFaculty.map((f) => ({ id: f.id, name: f.name, subject: f.subject }))}
        campusId={isCampusLocked ? profile.campus_id : selectedCampusId}
        campusName={campusName(isCampusLocked ? profile.campus_id : selectedCampusId)}
        needsCampusChoice={!isCampusLocked && !selectedCampusId}
      />

      <form method="GET" className="fac-search no-print">
        {selectedCampusId && <input type="hidden" name="campus" value={selectedCampusId} />}
        {showInactive && <input type="hidden" name="inactive" value="1" />}
        <input className="input" name="q" defaultValue={q} placeholder="Search name or subject (former names included)" />
        <button className="btn btn-ghost btn-sm">Search</button>
        {q && <Link className="btn btn-ghost btn-sm" href="/faculty">Clear</Link>}
      </form>

      {enriched.length === 0 ? (
        <div className="empty">
          <b>No faculty recorded yet{selectedCampusId ? ` at ${campusName(selectedCampusId)}` : ""}.</b>
          <div className="muted" style={{ marginTop: 6 }}>
            Teachers appear here the first time a coordinator files a verification for
            them, or a principal observes their class. You can also add one directly
            using the button above.
          </div>
        </div>
      ) : (
        <div className="fac-list">
          {enriched.map(({ f, m, remarks }) => (
            <Link key={f.id} href={`/faculty/${f.id}`} className="fac-row">
              <div className="fac-main">
                <div className="fac-name">
                  {f.name}
                  {!f.active && <span className="fac-chip fac-chip-off">Inactive</span>}
                  {(f.employee_code || "").toUpperCase().startsWith("TEMP-") && (
                    <span className="fac-chip fac-chip-off">Needs employee code</span>
                  )}
                </div>
                <div className="fac-sub">
                  {(f.subjects && f.subjects.length ? f.subjects.join(" · ") : f.subject) || "—"}
                  {!isCampusLocked && <> · {campusName(f.campus_id)}</>}
                  {m.verifications > 0 && <> · {m.verifications} verification{m.verifications === 1 ? "" : "s"}, {m.notebooks} notebooks</>}
                  {m.periodTo && <> · last {m.periodTo}</>}
                </div>
              </div>
              <div className="fac-figs">
                {m.behindPct == null ? (
                  <span className="muted" style={{ fontSize: 12 }}>no data yet</span>
                ) : (
                  <>
                    <span className={`fac-stat ${m.behindPct >= 50 ? "hot" : m.behindPct >= 25 ? "warm" : "cool"}`}>
                      {m.behindPct}%<small>behind</small>
                    </span>
                    {m.verifications < PROVISIONAL_BELOW && <span className="fac-chip">Provisional</span>}
                  </>
                )}
                {remarks > 0 && <span className="fac-chip">{remarks} remark{remarks === 1 ? "" : "s"}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="muted" style={{ fontSize: 11.5, marginTop: 14, lineHeight: 1.6 }}>
        &ldquo;Behind&rdquo; is the share of sampled notebooks past the delay threshold for their class band,
        so primary and senior teachers are compared fairly. It reflects copy-correction timeliness only —
        student handwriting, index and presentation are never counted against a teacher.
        <div style={{ marginTop: 4 }}>
          <Link href={`/faculty?${new URLSearchParams({ ...(selectedCampusId ? { campus: selectedCampusId } : {}), ...(q ? { q } : {}), ...(showInactive ? {} : { inactive: "1" }) }).toString()}`}>
            {showInactive ? "Hide" : "Show"} teachers who have left
          </Link>
        </div>
      </div>
    </div>
  );
}
