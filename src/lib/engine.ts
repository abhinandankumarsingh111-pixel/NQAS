// The NQAS engine. Pure, deterministic, framework-free. No React, no I/O.
// This is the component the whole product is built around.

import {
  OBS_BY_ID, RECOMMENDATIONS, BAND_ORDER, BAND_META, IMPACT_WEIGHT,
  CATEGORIES, type Band,
} from "./observations";

export interface StudentInput {
  name: string;
  lastChecked: string;   // yyyy-mm-dd or ""
  selected: string[];    // observation ids
  customs: string[];
}
export interface StudentResult {
  name: string;
  days: number | null;
  cpi: "Consistent" | "Irregular" | "Not evidenced";
  band: Band;
  remark: string;
}
export interface Academic { teacher: string; cls: string; subject: string }
export interface ReportMeta { campus: string; coordinatorName: string; date: string }
export interface Report {
  meta: ReportMeta;
  academic: Academic;
  students: StudentResult[];
  recs: string[];
  finalObservation: string;
  principalSummary: string;
  engine: "ai" | "deterministic";
}

const worseOf = (a: Band, b: Band): Band =>
  BAND_ORDER.indexOf(a) >= BAND_ORDER.indexOf(b) ? a : b;

export function daysSince(last: string, ref: string): number | null {
  if (!last || !ref) return null;
  const a = new Date(last), b = new Date(ref);
  if (isNaN(+a) || isNaN(+b)) return null;
  return Math.max(0, Math.round((+b - +a) / 86_400_000));
}

export function rulesEngine(ids: string[], days: number | null): { band: Band; cpi: StudentResult["cpi"] } {
  const sel = ids.map((i) => OBS_BY_ID[i]).filter(Boolean);
  const negs = sel.filter((o) => o.pol === "negative");
  const pos = sel.filter((o) => o.pol === "positive");

  let nw = 0; negs.forEach((o) => (nw += IMPACT_WEIGHT[o.impact]));
  let red = 0; pos.forEach((_, i) => (red += 0.6 * Math.pow(0.7, i)));
  const sc = Math.max(0, nw - red);

  let crit = 0; sel.forEach((o) => { if (o.crit) crit = Math.max(crit, o.crit); });

  let band: Band =
    sc <= 0.01 ? "Excellent" : sc <= 2 ? "Satisfactory" : sc <= 5 ? "Needs Improvement" : sc <= 9 ? "Major Concern" : "Critical";
  if (negs.length && band === "Excellent") band = "Satisfactory";
  if (crit === 2) band = "Critical";
  else if (crit === 1) band = worseOf(band, "Major Concern");

  const notEvidenced = ids.some((i) =>
    ["CQ.not_this_cycle", "CI.no_teacher_check", "CI.not_maintained", "CI.long_gap"].includes(i));
  const cpi: StudentResult["cpi"] = notEvidenced
    ? "Not evidenced"
    : ids.includes("CQ.regular") && (days == null || days <= 12) ? "Consistent" : "Irregular";

  return { band, cpi };
}

export function checkConsistency(ids: string[]): string[] {
  const set = new Set(ids), out: string[] = [], seen = new Set<string>();
  ids.forEach((id) => (OBS_BY_ID[id]?.excludes || []).forEach((ex) => {
    if (set.has(ex)) {
      const k = [id, ex].sort().join("|");
      if (!seen.has(k)) { seen.add(k); out.push(`"${OBS_BY_ID[id].label}" conflicts with "${OBS_BY_ID[ex].label}" — please review.`); }
    }
  }));
  return out;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const joinC = (a: string[]) =>
  a.length === 0 ? "" : a.length === 1 ? a[0] : a.length === 2 ? `${a[0]} and ${a[1]}`
    : `${a.slice(0, -1).join(", ")}, and ${a[a.length - 1]}`;

function fragmentsFor(ids: string[]) {
  const used = new Set<string>(), pos: string[] = [], neg: string[] = [];
  ids.map((i) => OBS_BY_ID[i]).filter(Boolean).forEach((o) => {
    if (used.has(o.id)) return;
    used.add(o.id); (o.mergesWith || []).forEach((m) => used.add(m));
    (o.pol === "negative" ? neg : pos).push(o.frag);
  });
  return { pos, neg };
}

export function remarkTrack1(s: StudentInput, idx: number): string {
  const { pos, neg } = fragmentsFor(s.selected);
  const contrast = ["though", "however,", "while"][idx % 3];
  let b: string;
  if (pos.length && neg.length) b = `${cap(joinC(pos))}, ${contrast} ${joinC(neg)}.`;
  else if (pos.length) b = `${cap(joinC(pos))}.`;
  else if (neg.length) b = `${cap(joinC(neg))}.`;
  else b = "No observations were recorded for this notebook.";
  const cus = (s.customs || []).filter(Boolean).map((c) => c.trim().replace(/\.?$/, "."));
  if (cus.length) b += " " + cus.join(" ");
  return b;
}

function topCats(results: StudentResult[], inputs: StudentInput[]): string[] {
  const c: Record<string, number> = {};
  inputs.forEach((s) => s.selected.forEach((id) => {
    const o = OBS_BY_ID[id]; if (o?.pol === "negative") c[o.cat] = (c[o.cat] || 0) + 1;
  }));
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([id]) => CATEGORIES.find((x) => x.id === id)!.name.toLowerCase());
}

function finalTrack1(results: StudentResult[], inputs: StudentInput[], academic: Academic): string {
  const n = results.length;
  const good = results.filter((s) => BAND_ORDER.indexOf(s.band) <= 1).length;
  const concern = n - good;
  const anyCrit = results.some((s) => s.band === "Critical");
  const ev = results.filter((s) => s.cpi === "Consistent").length;
  let cp = "checking is irregular across the sample";
  if (ev >= Math.ceil(n / 2)) cp = "checking is largely consistent";
  else if (results.filter((s) => s.cpi === "Not evidenced").length >= Math.ceil(n / 2)) cp = "checking is not consistently evidenced";
  const cats = topCats(results, inputs);
  const tail = anyCrit
    ? "One or more notebooks show critical lapses that call for immediate corrective action."
    : concern ? `The concerns centre chiefly on ${joinC(cats)} and should be addressed in the coming cycle.`
    : "Standards are being maintained and should be sustained.";
  return `Across the ${n} notebook${n > 1 ? "s" : ""} sampled for ${academic.teacher || "the teacher"}'s ${academic.subject || "subject"} (${academic.cls || "class"}), ${cp}. ${good} of ${n} ${good === 1 ? "was" : "were"} found satisfactory or better, while ${concern} require${concern === 1 ? "s" : ""} attention. ${tail}`;
}

function summaryTrack1(results: StudentResult[], academic: Academic, meta: ReportMeta, recs: string[]): string {
  const n = results.length;
  const worst = results.reduce<Band>((w, s) => worseOf(w, s.band), "Excellent");
  const action = recs.length ? recs[0] : "No corrective action is required at this stage.";
  return `Notebook verification of ${academic.subject || "subject"} (${academic.cls || "class"}) under ${academic.teacher || "the teacher"} was carried out on ${meta.date} across ${n} sample${n > 1 ? "s" : ""}. Overall the notebooks are ${BAND_META[worst].tone}. ${action}`;
}

export function consolidateRecs(allIds: string[]): string[] {
  const ids = new Set<string>();
  allIds.forEach((id) => { const r = OBS_BY_ID[id]?.rec; if (r) ids.add(r); });
  return [...ids].map((r) => RECOMMENDATIONS[r]).sort((a, b) => a.order - b.order).map((r) => r.text);
}

// Deterministic report (Track 1 only). AI paragraphs, if any, are layered on by the caller.
export function buildDeterministic(meta: ReportMeta, academic: Academic, students: StudentInput[]): Report {
  const results: StudentResult[] = students.map((s, idx) => {
    const d = daysSince(s.lastChecked, meta.date);
    const { band, cpi } = rulesEngine(s.selected, d);
    return { name: s.name, days: d, cpi, band, remark: remarkTrack1(s, idx) };
  });
  const recs = consolidateRecs(students.flatMap((s) => s.selected));
  return {
    meta, academic, students: results, recs,
    finalObservation: finalTrack1(results, students, academic),
    principalSummary: summaryTrack1(results, academic, meta, recs),
    engine: "deterministic",
  };
}

// Payload builder for the AI (Track 2). Kept here so the API route stays thin.
export function aiPayload(meta: ReportMeta, academic: Academic, students: StudentInput[]) {
  return {
    campus: meta.campus, teacher: academic.teacher, class: academic.cls, subject: academic.subject,
    date: meta.date, sampleSize: students.length,
    students: students.map((s) => {
      const d = daysSince(s.lastChecked, meta.date);
      const { band, cpi } = rulesEngine(s.selected, d);
      return {
        name: s.name, daysSinceChecked: d, checkingPattern: cpi, assessment: band,
        strengths: s.selected.map((i) => OBS_BY_ID[i]).filter((o) => o?.pol === "positive").map((o) => o.label),
        concerns: s.selected.map((i) => OBS_BY_ID[i]).filter((o) => o?.pol === "negative").map((o) => o.label),
        custom: (s.customs || []).filter(Boolean),
      };
    }),
    consolidatedRecommendations: consolidateRecs(students.flatMap((s) => s.selected)),
  };
}
