import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload
} from "lucide-react";
import { Modal } from "../common/Modal";
import { CSV_TEMPLATE, parseCsv } from "../../utils/csv";

const MAX_ROWS = 5000;

export function BulkImport({ open, onClose, onImport }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setFileName("");
    setRows([]);
    setParseError(null);
    setResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setResult(null);
    setParseError(null);

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsed = parseCsv(String(reader.result));

        if (!parsed.length) {
          setRows([]);
          setParseError("That file has a header row but no data rows.");
          return;
        }

        if (parsed.length > MAX_ROWS) {
          setRows([]);
          setParseError(
            `That file has ${parsed.length.toLocaleString()} rows. The API accepts at most ${MAX_ROWS.toLocaleString()} per import.`
          );
          return;
        }

        setRows(parsed);
      } catch {
        setRows([]);
        setParseError("That file could not be read as CSV.");
      }
    };

    reader.onerror = () => {
      setRows([]);
      setParseError("That file could not be read.");
    };

    reader.readAsText(file);

    // Let the same file be picked again after a failed import.
    e.target.value = "";
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(
      new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" })
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = "materials-template.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  async function submit() {
    if (!rows.length) return;

    try {
      setLoading(true);
      setResult(await onImport(rows));
    } catch (err) {
      setParseError(
        err?.message || "The import request failed before it reached the API."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Bulk import materials"
      onClose={handleClose}
      width={700}
    >
      <div className="import-box">
        <FileSpreadsheet size={34} />
        <strong>Import from CSV</strong>
        <span>
          Required per row: <code>code</code>, <code>name</code>,{" "}
          <code>uom</code>, and at least one of <code>categoryId</code> /{" "}
          <code>subcategoryId</code>. A sub-category at any depth is fine — the
          category is derived from it. <code>hsn</code>, <code>gst</code> and{" "}
          <code>status</code> are optional.
        </span>

        <div className="import-actions">
          <button
            className="button secondary"
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={16} />
            {fileName || "Choose CSV file"}
          </button>

          <button className="button ghost" onClick={downloadTemplate}>
            <Download size={15} />
            Template
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={handleFile}
        />
      </div>

      {parseError && <div className="form-error">{parseError}</div>}

      {rows.length > 0 && !result && (
        <div className="import-preview">
          <strong>
            {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"}{" "}
            ready to import
          </strong>

          <div className="mini-table">
            <div className="mini-row head">
              <span>code</span>
              <span>name</span>
              <span>category</span>
              <span>sub</span>
              <span>uom</span>
            </div>
            {rows.slice(0, 5).map((row, i) => (
              <div className="mini-row" key={i}>
                <span>{row.code ?? "—"}</span>
                <span>{row.name ?? "—"}</span>
                <span>{row.categoryId ?? "—"}</span>
                <span>{row.subcategoryId ?? "—"}</span>
                <span>{row.uom ?? "—"}</span>
              </div>
            ))}
          </div>

          {rows.length > 5 && (
            <span className="field-hint">
              Showing the first 5 of {rows.length.toLocaleString()}.
            </span>
          )}
        </div>
      )}

      {result && (
        <div className="import-result">
          <div className="result-added">
            <CheckCircle2 size={18} />
            <strong>{result.added?.length || 0} added</strong>
          </div>
          <div className="result-failed">
            <AlertCircle size={18} />
            <strong>{result.failed?.length || 0} failed</strong>
          </div>

          {result.failed?.length > 0 && (
            <div className="failed-list">
              {result.failed.map((failure, index) => (
                <div key={index}>
                  <strong>{failure.row?.code || `Row ${index + 1}`}</strong>
                  <span>
                    {Object.entries(failure.errors || {})
                      .map(([field, message]) => `${field}: ${message}`)
                      .join(" · ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="modal-actions">
        <button className="button secondary" onClick={handleClose}>
          {result ? "Done" : "Close"}
        </button>
        <button
          className="button primary"
          disabled={!rows.length || loading || Boolean(result)}
          onClick={submit}
        >
          {loading ? "Importing..." : "Import materials"}
        </button>
      </div>
    </Modal>
  );
}
