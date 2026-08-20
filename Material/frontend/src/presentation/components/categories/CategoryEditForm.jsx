import { useMemo, useState } from "react";
import { errorMessage } from "../../utils/apiError";
import { toCategoryPayload } from "../../../domain/entities/Category";
import { toSubcategoryPayload } from "../../../domain/entities/Subcategory";
import {
  countDescendants,
  moveTargetsFor
} from "../../../domain/services/categoryTree";
import { pathLabel } from "../../utils/labels";
import { STATUS, STATUS_OPTIONS } from "../../../domain/valueObjects/Status";

// PUT is a full replace on both resources, so this form owns every field —
// editing only the name still sends code, description and status back, and for
// a sub-category the placement too. Leaving any of them out would silently
// reset it, and a missing parentId would move a nested row to the top of its
// category.
export function CategoryEditForm({
  target,
  categories,
  subcategories,
  onSubmit,
  onCancel,
  submitting
}) {
  const item = target?.item ?? null;
  const isSubcategory = target?.type === "subcategory";

  const [name, setName] = useState(item?.name ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [status, setStatus] = useState(item?.status ?? STATUS.ACTIVE);

  const [categoryId, setCategoryId] = useState(
    item?.categoryId == null ? "" : String(item.categoryId)
  );
  const [parentId, setParentId] = useState(
    item?.parentId == null ? "" : String(item.parentId)
  );

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const movedCategory =
    isSubcategory && String(item?.categoryId ?? "") !== categoryId;

  // A sub-category cannot be moved under itself or under one of its own
  // children — the API walks the whole ancestor chain and 400s. Those targets
  // are removed here rather than offered and rejected.
  const parentOptions = useMemo(() => {
    if (!isSubcategory) return [];

    const scoped = subcategories.filter(
      (row) => String(row.categoryId) === categoryId
    );

    return moveTargetsFor(scoped, { ...item, categoryId: Number(categoryId) });
  }, [isSubcategory, subcategories, categoryId, item]);

  const childCount = isSubcategory
    ? countDescendants(subcategories, item?.id)
    : 0;

  const currentPath = isSubcategory ? pathLabel(item) : item?.name;

  function clearErrors() {
    setErrors({});
    setFormError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setErrors({ name: "Name is required" });
      return;
    }

    const changes = {
      name: name.trim(),
      code: code.trim() || null,
      description: description.trim() || null,
      status
    };

    try {
      await onSubmit({
        type: target.type,
        id: item.id,
        payload: isSubcategory
          ? toSubcategoryPayload(item, {
              ...changes,
              categoryId: Number(categoryId),
              parentId: parentId ? Number(parentId) : null
            })
          : toCategoryPayload(item, changes)
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
      <div className="form-row">
        <div className="form-field grow">
          <label>{isSubcategory ? "Sub-category" : "Category"} name *</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearErrors();
            }}
            placeholder="e.g. Pipes"
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>

        <div className="form-field code-field">
          <label>Code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="PIP"
          />
        </div>
      </div>

      <div className="form-grid tight">
        <div className="form-field full">
          <label>Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div className="form-field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isSubcategory && (
        <div className="form-section move-section">
          <div className="form-section-title">Placement</div>

          <div className="existing-chips">
            <span>Currently:</span>
            <span className="chip">{currentPath}</span>
          </div>

          <div className="form-grid tight">
            <div className="form-field">
              <label>Category</label>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setParentId("");
                  clearErrors();
                }}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {errors.categoryId && (
                <span className="field-error">{errors.categoryId}</span>
              )}
            </div>

            <div className="form-field">
              <label>Inside</label>
              <select
                value={parentId}
                onChange={(e) => {
                  setParentId(e.target.value);
                  clearErrors();
                }}
              >
                <option value="">Top of the category</option>
                {parentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {"  ".repeat(Math.max(0, option.depth - 1))}
                    {option.depth > 1 ? "└ " : ""}
                    {option.name}
                  </option>
                ))}
              </select>
              {errors.parentId && (
                <span className="field-error">{errors.parentId}</span>
              )}
            </div>
          </div>

          <span className="field-hint">
            {movedCategory && childCount > 0
              ? `Moving to another category is refused while this has ${childCount} sub-categor${
                  childCount === 1 ? "y" : "ies"
                } under it — they pin the old category on themselves.`
              : "Its own sub-categories and materials move with it."}
          </span>
        </div>
      )}

      {!isSubcategory && (
        <span className="field-hint">
          Its sub-categories and materials are not affected.
        </span>
      )}

      {formError && <div className="form-error">{formError}</div>}

      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" disabled={submitting}>
          {submitting ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}
