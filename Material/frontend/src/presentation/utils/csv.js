// Columns the API reads as ids rather than text. Everything else stays a
// string — `gst: "18%"` and `hsn: "7306"` are both text on the wire.
const NUMERIC_COLUMNS = ["categoryId", "subcategoryId"];

// Minimal RFC-4180 field splitter: honours quoted fields so a name containing a
// comma ("Angle, 50x50") does not shear into two columns, and "" is an escaped
// quote inside one.
export function splitCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value);
  return values.map((entry) => entry.trim());
}

export function parseCsv(text) {
  const lines = String(text)
    .replace(/^﻿/, "")
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim());

  if (!lines.length) return [];

  const headers = splitCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {};

    headers.forEach((header, i) => {
      const raw = values[i] ?? "";

      // A blank placement column is left off the row entirely so the API can
      // derive it. Sending "" instead would be read as a value and rejected.
      if (raw === "") return;

      row[header] = NUMERIC_COLUMNS.includes(header) ? Number(raw) : raw;
    });

    return row;
  });
}

export const CSV_TEMPLATE = [
  "code,name,categoryId,subcategoryId,uom,hsn,gst,status",
  "BULK-001,Bulk Item A,1,,m,7308,18%,Active",
  "BULK-002,Bulk Item B,,3,bag,2523,28%,Active"
].join("\n");
