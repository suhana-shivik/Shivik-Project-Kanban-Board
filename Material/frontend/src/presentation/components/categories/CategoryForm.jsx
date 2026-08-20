import { useMemo, useState } from "react";
import { CornerDownRight, Plus, X } from "lucide-react";
import { errorMessage } from "../../utils/apiError";
import { flattenSubcategories } from "../../../domain/services/categoryTree";
import { PATH_SEPARATOR, pathLabel } from "../../utils/labels";

const emptyRow = { name: "", code: "" };

export function CategoryForm({
  categories,
  subcategories,
  initialCategoryId = null,
  initialParentId = null,
  onSubmit,
  onCancel,
  submitting
}) {
  const hasCategories = categories.length > 0;

  const [mode, setMode] = useState(
    initialCategoryId != null && hasCategories ? "existing" : "new"
  );

  const [newCategory, setNewCategory] = useState({
    name: "",
    code: "",
    description: ""
  });

  const [categoryId, setCategoryId] = useState(
    initialCategoryId == null ? "" : String(initialCategoryId)
  );
  const [parentId, setParentId] = useState(
    initialParentId == null ? "" : String(initialParentId)
  );

  const [subRows, setSubRows] = useState([emptyRow]);
  const [nest, setNest] = useState(false);

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  // Sub-categories nest without limit, so anything in the category is a valid
  // parent — not just the top-level ones.
  const placements = useMemo(
    () => flattenSubcategories(subcategories, categoryId),
    [subcategories, categoryId]
  );

  const parent = placements.find((s) => String(s.id) === parentId) ?? null;
  const category = categories.find((c) => String(c.id) === categoryId) ?? null;

  const basePath = useMemo(() => {
    if (mode === "new") return [newCategory.name.trim() || "New category"];
    if (parent) return parent.path?.length ? parent.path : [parent.name];
    if (category) return [category.name];
    return [];
  }, [mode, newCategory.name, parent, category]);

  const filledRows = subRows.filter((row) => row.name.trim());

  const preview = useMemo(() => {
    if (!basePath.length) return null;

    const names = filledRows.map((row) => row.name.trim());

    if (!names.length) return basePath.join(PATH_SEPARATOR);

    if (nest) return [...basePath, ...names].join(PATH_SEPARATOR);

    return `${[...basePath, names[0]].join(PATH_SEPARATOR)}${
      names.length > 1 ? `  (+${names.length - 1} more alongside it)` : ""
    }`;
  }, [basePath, filledRows, nest]);

  function clearErrors() {
    setErrors({});
    setFormError(null);
  }

  function switchMode(next) {
    setMode(next);
    clearErrors();
  }

  function selectCategory(value) {
    setCategoryId(value);
    setParentId(""); // A sub-category cannot straddle two categories.
    clearErrors();
  }

  function updateRow(index, field, value) {
    setSubRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
    clearErrors();
  }

  function addRow() {
    setSubRows((prev) => [...prev, { ...emptyRow }]);
    clearErrors();
  }

  function removeRow(index) {
    setSubRows((prev) =>
      prev.length === 1 ? [{ ...emptyRow }] : prev.filter((_, i) => i !== index)
    );
    clearErrors();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    const clientErrors = {};

    if (mode === "new" && !newCategory.name.trim()) {
      clientErrors.categoryName = "Category name is required";
    }

    if (mode === "existing") {
      if (!categoryId) clientErrors.categoryId = "Choose where this goes";
      if (!filledRows.length) {
        clientErrors.subRows =
          "Enter a sub-category name, or switch to “New category”";
      }
    }

    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      return;
    }

    const rows = filledRows.map((row) => ({
      name: row.name.trim(),
      ...(row.code.trim() ? { code: row.code.trim() } : {})
    }));

    try {
      await onSubmit({
        category:
          mode === "new"
            ? {
                name: newCategory.name.trim(),
                ...(newCategory.code.trim()
                  ? { code: newCategory.code.trim() }
                  : {}),
                ...(newCategory.description.trim()
                  ? { description: newCategory.description.trim() }
                  : {})
              }
            : null,
        categoryId: mode === "existing" ? Number(categoryId) : null,
        parentId: mode === "existing" && parentId ? Number(parentId) : null,
        subcategories: rows,
        nest
      });
    } catch (err) {
      const fieldErrors = err?.errors || {};
      setErrors(fieldErrors);

      if (!Object.keys(fieldErrors).length) {
        setFormError(errorMessage(err, "Could not save. Please try again."));
      }
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-section">
        <div className="form-section-title">
          <span className="step-badge">1</span>
          Where does it go?
        </div>

        <div className="segmented">
          <button
            type="button"
            className={mode === "new" ? "active" : ""}
            onClick={() => switchMode("new")}
          >
            New category
          </button>
          <button
            type="button"
            className={mode === "existing" ? "active" : ""}
            disabled={!hasCategories}
            title={hasCategories ? undefined : "There are no categories yet"}
            onClick={() => switchMode("existing")}
          >
            Inside an existing one
          </button>
        </div>

        {mode === "new" ? (
          <>
            <div className="form-row">
              <div className="form-field grow">
                <label>Category name *</label>
                <input
                  autoFocus
                  value={newCategory.name}
                  onChange={(e) => {
                    setNewCategory((prev) => ({
                      ...prev,
                      name: e.target.value
                    }));
                    clearErrors();
                  }}
                  placeholder="e.g. Electricals"
                />
              </div>

              <div className="form-field code-field">
                <label>Code</label>
                <input
                  value={newCategory.code}
                  onChange={(e) =>
                    setNewCategory((prev) => ({
                      ...prev,
                      code: e.target.value
                    }))
                  }
                  placeholder="ELE"
                />
              </div>
            </div>

            <div className="form-field">
              <label>Description</label>
              <input
                value={newCategory.description}
                onChange={(e) =>
                  setNewCategory((prev) => ({
                    ...prev,
                    description: e.target.value
                  }))
                }
                placeholder="Wiring, fittings and fixtures"
              />
            </div>

            {errors.categoryName || errors.name ? (
              <span className="field-error">
                {errors.categoryName || errors.name}
              </span>
            ) : (
              <span className="field-hint">
                Category names must be unique, compared case-insensitively.
              </span>
            )}
          </>
        ) : (
          <>
            <div className="form-field">
              <label>Category *</label>
              <select
                value={categoryId}
                onChange={(e) => selectCategory(e.target.value)}
              >
                <option value="">Select a category</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {errors.categoryId && (
                <span className="field-error">{errors.categoryId}</span>
              )}
            </div>

            <div className="form-field">
              <label>Inside which sub-category</label>
              <select
                value={parentId}
                disabled={!categoryId || !placements.length}
                onChange={(e) => {
                  setParentId(e.target.value);
                  clearErrors();
                }}
              >
                <option value="">
                  {!categoryId
                    ? "Select a category first"
                    : placements.length
                    ? "Top of the category"
                    : "No sub-categories yet"}
                </option>
                {placements.map((item) => (
                  <option key={item.id} value={item.id}>
                    {"  ".repeat(Math.max(0, item.depth - 1))}
                    {item.depth > 1 ? "└ " : ""}
                    {item.name}
                  </option>
                ))}
              </select>
              {errors.parentId ? (
                <span className="field-error">{errors.parentId}</span>
              ) : (
                <span className="field-hint">
                  Nesting has no depth limit — pick any level, or leave this on
                  “Top of the category”.
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="form-section">
        <div className="form-section-title">
          <span className="step-badge">2</span>
          Sub-categories {mode === "new" && "(optional)"}
        </div>

        {mode === "existing" && parent && (
          <div className="existing-chips">
            <span>Going inside:</span>
            <span className="chip">{pathLabel(parent)}</span>
          </div>
        )}

        <div className="level-list">
          {subRows.map((row, index) => (
            <div className="level-row" key={index}>
              <span
                className="level-branch"
                style={
                  nest ? { marginLeft: `${index * 14}px` } : undefined
                }
              />
              <input
                value={row.name}
                onChange={(e) => updateRow(index, "name", e.target.value)}
                placeholder={
                  nest && index > 0
                    ? `Inside “${
                        subRows[index - 1].name.trim() || "the row above"
                      }”`
                    : `Inside ${
                        basePath[basePath.length - 1] || "the category above"
                      }`
                }
              />
              <input
                className="code-input"
                value={row.code}
                onChange={(e) => updateRow(index, "code", e.target.value)}
                placeholder="Code"
              />
              <button
                type="button"
                className="icon-button"
                disabled={subRows.length === 1 && !row.name && !row.code}
                onClick={() => removeRow(index)}
                aria-label={`Remove sub-category ${index + 1}`}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>

        {errors.subRows && <span className="field-error">{errors.subRows}</span>}

        <div className="row-between">
          <button type="button" className="link-button" onClick={addRow}>
            <Plus size={14} />
            Add another
          </button>

          {subRows.length > 1 && (
            <label className="inline-check">
              <input
                type="checkbox"
                checked={nest}
                onChange={(e) => setNest(e.target.checked)}
              />
              <CornerDownRight size={13} />
              Nest each one inside the previous
            </label>
          )}
        </div>

        <span className="field-hint">
          {nest
            ? "Each row is created inside the row above it, building one deep branch."
            : "Each row is created side by side in the same place. Names only have to be unique among siblings."}
        </span>
      </div>

      {preview && (
        <div className="path-preview">
          <span>Result</span>
          <code>{preview}</code>
        </div>
      )}

      {formError && <div className="form-error">{formError}</div>}

      <p className="form-note">
        After saving, the “Add material” form opens with this place
        pre-selected.
      </p>

      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" disabled={submitting}>
          {submitting ? "Saving..." : "Save & add material"}
        </button>
      </div>
    </form>
  );
}
