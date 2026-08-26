"use client";
import { useState } from "react";

/**
 * Send the report to WhatsApp as an actual PDF.
 *
 * There is no way to attach a file to WhatsApp from a plain web link — a
 * wa.me link carries text and nothing else. What does work is handing the file
 * to the phone's own share sheet, where WhatsApp appears alongside Gmail and
 * Drive. So this fetches the PDF, wraps it in a File, and passes it to
 * navigator.share.
 *
 * Deliberately NOT a public link. The alternative design — mint an unguessable
 * URL and WhatsApp that — is easier and works on desktop too, but it turns a
 * teacher's record into something readable by anyone the message is ever
 * forwarded to, for as long as the link lives. Sending the file means the
 * report goes to the people chosen in the share sheet and no URL exists to
 * escape later.
 *
 * On a desktop browser there is no share sheet, so the file downloads instead
 * and the person attaches it themselves. That is stated plainly rather than
 * left to be discovered.
 */
export default function ShareReport({
  reportId, teacher, subject, cls, date,
}: {
  reportId: string; teacher: string; subject: string; cls: string; date: string;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  async function run() {
    setBusy(true); setNote(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/pdf`);
      if (!res.ok) { setNote(await res.text() || "Could not build the PDF."); return; }

      const blob = await res.blob();
      const filename = (res.headers.get("Content-Disposition") || "")
        .match(/filename="([^"]+)"/)?.[1] || `NQAS-report-${date}.pdf`;
      const file = new File([blob], filename, { type: "application/pdf" });

      const canShareFile = typeof navigator !== "undefined"
        && !!navigator.canShare && navigator.canShare({ files: [file] });

      if (canShareFile) {
        try {
          await navigator.share({
            files: [file],
            title: `Notebook Verification — ${teacher}`,
            text: `Notebook Verification Report\n${teacher} · ${subject} (${cls})\n${date}`,
          });
          return;
        } catch (err) {
          // Dismissing the share sheet is not a failure and should say nothing.
          if ((err as Error)?.name === "AbortError") return;
          // Some browsers refuse to share once an await has intervened. Falling
          // back to a download still gets the person their file.
          download(blob, filename);
          setNote("Your browser would not open the share sheet, so the PDF was downloaded instead — attach it from your files.");
          return;
        }
      }

      download(blob, filename);
      setNote("Downloaded. This browser has no share sheet — attach the PDF to WhatsApp from your files. On a phone, the button sends it straight to a chat.");
    } catch {
      setNote("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn btn-accent btn-sm" onClick={run} disabled={busy}>
        {busy ? "Preparing…" : "Send report (PDF)"}
      </button>
      {note && (
        <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, flexBasis: "100%", marginTop: 2 }}>
          {note}
        </div>
      )}
    </>
  );
}
