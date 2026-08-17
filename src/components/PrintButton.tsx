"use client";

export default function PrintButton({ label = "🖨 Print record" }: { label?: string }) {
  return (
    <button className="btn btn-ghost btn-sm no-print" onClick={() => window.print()}>{label}</button>
  );
}
