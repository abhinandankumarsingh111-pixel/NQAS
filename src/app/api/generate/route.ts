import { NextResponse } from "next/server";
import { buildDeterministic, aiPayload, type Academic, type ReportMeta, type StudentInput } from "@/lib/engine";

// Builds the report server-side. Deterministic always; AI paragraphs when a key is set.
export async function POST(req: Request) {
  const { meta, academic, students, useAI } = (await req.json()) as {
    meta: ReportMeta; academic: Academic; students: StudentInput[]; useAI: boolean;
  };

  const base = buildDeterministic(meta, academic, students);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!useAI || !key) return NextResponse.json(base);

  try {
    const payload = aiPayload(meta, academic, students);
    const prompt =
      "You are an academic coordinator writing a formal notebook verification report for a school. " +
      "Using ONLY the structured facts in the JSON below, write:\n" +
      "1) finalObservation: a formal institutional paragraph (3-4 sentences) synthesising findings across the sampled notebooks.\n" +
      "2) principalSummary: a concise 2-3 sentence summary addressed to the Principal.\n" +
      "Rules: formal institutional tone; do NOT invent facts; NO numeric scores or percentages; be fair, noting strengths and concerns where present; no bullet points.\n" +
      'Respond ONLY with JSON: {"finalObservation":"...","principalSummary":"..."}\n\nFACTS:\n' +
      JSON.stringify(payload);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    const text = (data.content || []).map((i: { type: string; text?: string }) => (i.type === "text" ? i.text : "")).join("").trim().replace(/```json|```/g, "").trim();
    const p = JSON.parse(text);
    const bad = (t: string) => !t || t.length < 20 || /\b\d+\s*\/\s*\d+\b/.test(t) || /score\s*[:=]/i.test(t);
    if (bad(p.finalObservation) || bad(p.principalSummary)) throw new Error("gate");
    return NextResponse.json({ ...base, finalObservation: p.finalObservation, principalSummary: p.principalSummary, engine: "ai" });
  } catch {
    return NextResponse.json(base); // graceful fallback to deterministic
  }
}
