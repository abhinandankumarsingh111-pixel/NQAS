// Parsing a pasted or uploaded teacher roster.
//
// The realistic input is not a well-formed CSV. It is a block copied straight
// out of an Excel column, or a file exported by whatever the school office
// uses, with a header row that may or may not be there, a stray blank line at
// the end, and someone's name typed with two spaces in the middle. All of that
// is handled here rather than rejected, because a roster the office cannot
// paste is a feature nobody uses.
//
// Nothing in this file writes anything. It turns text into rows plus a verdict
// per row, so the UI can show exactly what is about to happen and the person
// can look at it before agreeing. An import that silently creates forty
// personnel records is not something to run on trust.
//
// Pure and deterministic. No React, no I/O.

export interface ImportRow {
  /** 1-based line number in the pasted text, so a problem can be pointed at. */
  line: number;
  name: string;
  subjects: string[];
  employeeCode: string | null;
  /** What will happen to this row, and why. */
  verdict: "new" | "duplicate-in-file" | "already-on-roll" | "invalid";
  note?: string;
}

export interface ParsedImport {
  rows: ImportRow[];
  /** Rows that will actually be created. */
  importable: ImportRow[];
  /** True when the first line was consumed as column headings. */
  hadHeader: boolean;
  delimiter: "comma" | "tab";
}

/** Collapse runs of whitespace and trim. "  Anita   Sharma " -> "Anita Sharma". */
export function tidyName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Case- and spacing-insensitive key for comparing two names. */
export function nameKey(s: string): string {
  return tidyName(s).toLowerCase();
}

/**
 * Split one line into fields, honouring double quotes so that a quoted subject
 * list containing the delimiter survives. Doubled quotes inside a quoted field
 * are an escaped quote, which is what Excel emits.
 */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "", inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(cur); cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

// Subjects arrive separated by semicolons (so a comma-delimited file is not
// ambiguous), but people also use slashes and the word "and", and a single
// pasted Excel column will use commas because nothing stopped them. Any of
// those work.
function splitSubjects(s: string): string[] {
  return s
    .split(/[;/,]| and /i)
    .map(tidyName)
    .filter(Boolean);
}

// Any cell matching one of these makes the row a header. Checking only the
// FIRST cell was wrong: an office that exports "Employee Code, Name, Subjects"
// has a perfectly good header row that would then be read as a teacher called
// "Employee Code".
const HEADER_WORDS =
  /^(name|teacher|teacher ?name|full ?name|s\.?no\.?|sl\.?no\.?|subjects?|(employee|emp|staff) ?(code|id|no\.?)|code)$/i;

/**
 * Turn pasted text into reviewable rows.
 *
 * `existingNames` is the campus's current roll. A name already on it is
 * reported as "already-on-roll" and excluded from the import rather than
 * creating a second record for the same person, which is the mistake this
 * whole preview exists to prevent.
 */
export function parseFacultyImport(text: string, existingNames: string[] = []): ParsedImport {
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim());
  const firstFilled = headerIdx >= 0 ? lines[headerIdx] : "";
  const delimiter: "comma" | "tab" = firstFilled.includes("\t") ? "tab" : "comma";
  const delim = delimiter === "tab" ? "\t" : ",";

  // A row is a header only if EVERY non-empty cell in it is a heading word.
  // Requiring all of them (rather than any) keeps a teacher who happens to be
  // called "Code" from erasing her own row, while still recognising a header
  // whose columns are in an unexpected order.
  const headerCells = splitLine(firstFilled, delim);
  const filledHeaderCells = headerCells.filter((c) => c.trim());
  const hadHeader = filledHeaderCells.length > 0
    && filledHeaderCells.every((c) => HEADER_WORDS.test(c.trim()));

  // With a header present, find the columns by name so the office can put them
  // in any order. Without one, fall back to Name, Subjects, Code.
  let iName = 0, iSubjects = 1, iCode = 2;
  if (hadHeader) {
    const at = (re: RegExp) => headerCells.findIndex((h) => re.test(h.trim()));
    const n = at(/^(name|teacher ?name|full ?name)$/i);
    const s = at(/subject/i);
    const c = at(/(employee|emp|staff).*(code|id|no)|^code$/i);
    if (n >= 0) iName = n;
    if (s >= 0) iSubjects = s;
    iCode = c >= 0 ? c : -1;
  }

  const onRoll = new Set(existingNames.map(nameKey));
  const seenInFile = new Set<string>();
  const rows: ImportRow[] = [];

  lines.forEach((raw, idx) => {
    if (hadHeader && idx === headerIdx) return; // the header itself
    if (!raw.trim()) return;                    // blank padding

    const cells = splitLine(raw, delim);
    const name = tidyName(cells[iName] || "");
    const subjects = splitSubjects(cells[iSubjects] || "");
    const employeeCode = (iCode >= 0 ? (cells[iCode] || "").trim().toUpperCase() : "") || null;
    const line = idx + 1;

    if (name.length < 2) {
      rows.push({ line, name, subjects, employeeCode, verdict: "invalid",
        note: "No name in this row." });
      return;
    }
    // A row that is just a serial number and nothing else is spreadsheet
    // furniture, not a person.
    if (/^\d+$/.test(name)) {
      rows.push({ line, name, subjects, employeeCode, verdict: "invalid",
        note: "This looks like a row number, not a name." });
      return;
    }

    // Matching on NAME ALONE is deliberately stricter than the database, which
    // allows two teachers with the same name as long as their employee codes
    // differ. Two people really can share a name, but the far commoner case is
    // the same person being re-imported, and creating a phantom second record
    // for a real teacher splits her verification history in half. So a name
    // collision is always skipped and named, and the genuinely-distinct case is
    // handled one at a time on the teacher's own page, where the owner has to
    // say out loud that this is a different person.
    const key = nameKey(name);
    if (onRoll.has(key)) {
      rows.push({ line, name, subjects, employeeCode, verdict: "already-on-roll",
        note: "Someone of this name is already on this roll. If this is a different person, "
          + "add them individually after the import so the two records can be told apart." });
    } else if (seenInFile.has(key)) {
      rows.push({ line, name, subjects, employeeCode, verdict: "duplicate-in-file",
        note: "This name appears earlier in the list. Only the first was kept." });
    } else {
      seenInFile.add(key);
      rows.push({ line, name, subjects, employeeCode, verdict: "new" });
    }
  });

  return {
    rows,
    importable: rows.filter((r) => r.verdict === "new"),
    hadHeader,
    delimiter,
  };
}

/** The example shown in the UI, and the file the "Download template" link gives. */
export const IMPORT_TEMPLATE =
  "Name,Subjects,Employee Code\n" +
  "Anita Sharma,Maths;Science,KV-1042\n" +
  "R. Venkatesh,English,KV-1043\n" +
  "Sunita Patnaik,Hindi,\n";
