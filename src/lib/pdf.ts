// A very small PDF writer: text, rules, filled boxes, and nothing else.
//
// Why hand-rolled rather than a library. The report already renders as a
// printable page, and the browser's own "Print → Save as PDF" has always been
// available. What that cannot do is hand a FILE to WhatsApp — for that the
// server has to produce real PDF bytes. The document needed is a typeset text
// document with a rule or two, which is close to the simplest thing the PDF
// format can express, and shipping a rasteriser or a headless browser to draw
// it would cost more than it is worth.
//
// Only the two standard Helvetica faces are used, so no font is embedded and
// no glyph data ships. Text is written in WinAnsi, which covers everything
// these reports contain.
//
// Pure and deterministic. No React, no I/O.

/** Character widths per 1000 units, ASCII 32–126, from the Helvetica metrics. */
const W_REG = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** The same for Helvetica-Bold. */
const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// The handful of non-ASCII characters these reports actually contain, mapped to
// their WinAnsi byte and width. Anything else is transliterated to "?" rather
// than silently emitted as a byte that renders as a different glyph.
const WINANSI: Record<string, [number, number, number]> = {
  // char: [byte, regular width, bold width]
  "–": [0x96, 556, 556],   // – en dash
  "—": [0x97, 1000, 1000], // — em dash
  "‘": [0x91, 222, 278],   // ‘
  "’": [0x92, 222, 278],   // ’
  "“": [0x93, 333, 500],   // “
  "”": [0x94, 333, 500],   // ”
  "…": [0x85, 1000, 1000], // …
  "•": [0x95, 350, 350],   // • bullet
  "·": [0xB7, 278, 278],   // ·
  " ": [0x20, 278, 278],   // non-breaking space
  "₹": [0x3F, 556, 556],   // ₹ has no WinAnsi slot — becomes "?"
};

export interface TextOpts {
  size?: number;
  bold?: boolean;
  /** 0–1 RGB. Defaults to black. */
  color?: [number, number, number];
}

function charWidth(ch: string, bold: boolean): number {
  const code = ch.charCodeAt(0);
  if (code >= 32 && code <= 126) return (bold ? W_BOLD : W_REG)[code - 32];
  const m = WINANSI[ch];
  if (m) return bold ? m[2] : m[1];
  return bold ? 556 : 556; // unknown -> "?" width
}

/** Width of a string at a given size, in points. */
export function textWidth(s: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch, bold);
  return (w * size) / 1000;
}

/** Greedy word wrap. Words longer than the line are broken mid-word. */
export function wrapText(s: string, maxWidth: number, size: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of String(s ?? "").split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, bold) <= maxWidth) { line = candidate; continue; }
      if (line) { out.push(line); line = ""; }
      // A single word too wide for the column — break it rather than overflow.
      let chunk = "";
      for (const ch of word) {
        if (textWidth(chunk + ch, size, bold) > maxWidth && chunk) { out.push(chunk); chunk = ""; }
        chunk += ch;
      }
      line = chunk;
    }
    out.push(line);
  }
  return out.length ? out : [""];
}

/** Escape a string into a PDF literal, emitting WinAnsi bytes as octal. */
function pdfString(s: string): string {
  let out = "";
  for (const ch of String(s ?? "")) {
    const code = ch.charCodeAt(0);
    if (ch === "\\") { out += "\\\\"; continue; }
    if (ch === "(") { out += "\\("; continue; }
    if (ch === ")") { out += "\\)"; continue; }
    if (code >= 32 && code <= 126) { out += ch; continue; }
    const m = WINANSI[ch];
    const byte = m ? m[0] : 0x3F; // "?"
    out += `\\${byte.toString(8).padStart(3, "0")}`;
  }
  return out;
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();

export class Pdf {
  readonly width: number;
  readonly height: number;
  private pages: string[] = [];
  private cur: string[] = [];

  constructor(width = 595.28, height = 841.89) { // A4 in points
    this.width = width;
    this.height = height;
  }

  /** Start a new page. The first page exists implicitly. */
  newPage(): void {
    this.pages.push(this.cur.join("\n"));
    this.cur = [];
  }

  /** Draw text with its BASELINE at (x, y), measured from the bottom-left. */
  text(s: string, x: number, y: number, o: TextOpts = {}): void {
    const size = o.size ?? 10;
    const font = o.bold ? "/F2" : "/F1";
    const [r, g, b] = o.color ?? [0, 0, 0];
    this.cur.push(
      `BT ${num(r)} ${num(g)} ${num(b)} rg ${font} ${num(size)} Tf ` +
      `${num(x)} ${num(y)} Td (${pdfString(s)}) Tj ET`);
  }

  rect(x: number, y: number, w: number, h: number, color: [number, number, number]): void {
    const [r, g, b] = color;
    this.cur.push(`${num(r)} ${num(g)} ${num(b)} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);
  }

  line(x1: number, y1: number, x2: number, y2: number,
       color: [number, number, number] = [0.8, 0.8, 0.8], w = 0.7): void {
    const [r, g, b] = color;
    this.cur.push(
      `${num(r)} ${num(g)} ${num(b)} RG ${num(w)} w ` +
      `${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`);
  }

  /**
   * Serialise to PDF bytes.
   *
   * Returns an ArrayBuffer rather than a Uint8Array on purpose. A Uint8Array is
   * typed over ArrayBufferLike, which includes SharedArrayBuffer, and so is not
   * accepted as a response body without a cast. Handing back the buffer itself
   * keeps the call sites honest and cast-free.
   */
  build(): ArrayBuffer {
    const contents = [...this.pages, this.cur.join("\n")];
    const pageCount = contents.length;

    // Object numbering: 1 catalog, 2 pages, 3 font regular, 4 font bold,
    // then per page a page object and a content stream.
    const firstPageObj = 5;
    const kids = contents.map((_, i) => `${firstPageObj + i * 2} 0 R`).join(" ");

    const objects: string[] = [
      `<< /Type /Catalog /Pages 2 0 R >>`,
      `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
    ];

    contents.forEach((stream, i) => {
      const contentObjNum = firstPageObj + i * 2 + 1;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.width)} ${num(this.height)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNum} 0 R >>`);
      objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });

    // Latin-1 throughout, so one character is exactly one byte and the xref
    // offsets below are simply string lengths.
    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefAt = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

    const buf = new ArrayBuffer(out.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < out.length; i++) view[i] = out.charCodeAt(i) & 0xff;
    return buf;
  }
}
