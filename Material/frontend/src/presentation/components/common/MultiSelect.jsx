import { Check } from "lucide-react";

// A checkable list rather than a native `<select multiple>`, which needs
// ctrl-click to deselect and hides its own overflow. Selections are ids, and
// an empty array is meaningful — it is how the form says "clear these".
export function MultiSelect({ label, hint, options, selected = [], onChange, emptyText }) {
  const chosen = new Set(selected.map(Number));

  function toggle(id) {
    const next = new Set(chosen);

    if (next.has(id)) next.delete(id);
    else next.add(id);

    onChange([...next]);
  }

  return (
    <div className="form-field">
      <label>
        {label}
        {chosen.size > 0 && <span className="chosen-count">{chosen.size}</span>}
      </label>

      {options.length === 0 ? (
        <div className="multi-empty">{emptyText || "Nothing to choose from."}</div>
      ) : (
        <div className="multi-select">
          {options.map((option) => {
            const active = chosen.has(Number(option.id));

            return (
              <button
                key={option.id}
                type="button"
                className={`multi-option ${active ? "active" : ""}`}
                onClick={() => toggle(Number(option.id))}
                aria-pressed={active}
              >
                <span className="multi-check">{active && <Check size={12} />}</span>
                <span className="multi-label">{option.label}</span>
                {option.hint && <span className="multi-hint">{option.hint}</span>}
              </button>
            );
          })}
        </div>
      )}

      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
