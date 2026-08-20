import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "../../utils/apiError";
import { UOM_GROUPS } from "../../../domain/valueObjects/UOM";
import { STATUS, STATUS_OPTIONS } from "../../../domain/valueObjects/Status";
import { flattenSubcategories } from "../../../domain/services/categoryTree";
import { PATH_SEPARATOR, pathLabel } from "../../utils/labels";

const emptyMaterial = {
  code: "",
  name: "",
  categoryId: "",
  subcategoryId: "",
  uom: "",
  hsn: "",
  gst: "",
  status: STATUS.ACTIVE
};

const GST_OPTIONS = ["0%", "5%", "12%", "18%", "28%"];

export function MaterialForm({
  material,
  categories,
  subcategories,
  initialCategoryId = null,
  initialSubcategoryId = null,
  onSubmit,
  onCancel,
  submitting
}) {
  const [form, setForm] = useState(emptyMaterial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    setForm(
      material
        ? {
            code: material.code ?? "",
            name: material.name ?? "",
            categoryId:
              material.categoryId == null ? "" : String(material.categoryId),
            subcategoryId:
              material.subcategoryId == null
                ? ""
                : String(material.subcategoryId),
            uom: material.uom ?? "",
            hsn: material.hsn === "-" ? "" : material.hsn ?? "",
            gst: material.gst === "-" ? "" : material.gst ?? "",
            status: material.status ?? STATUS.ACTIVE
          }
        : {
            ...emptyMaterial,
            categoryId:
              initialCategoryId == null ? "" : String(initialCategoryId),
            subcategoryId:
              initialSubcategoryId == null ? "" : String(initialSubcategoryId)
          }
    );
    setErrors({});
    setFormError(null);
  }, [material, initialCategoryId, initialSubcategoryId]);

  // A material can hang off a sub-category at any depth, so every level in the
  // category is offered, indented by how deep it sits.
  const availableSubs = useMemo(
    () => flattenSubcategories(subcategories, form.categoryId),
    [subcategories, form.categoryId]
  );

  const selectedSub =
    availableSubs.find((sub) => String(sub.id) === form.subcategoryId) ?? null;

  const selectedCategory =
    categories.find((c) => String(c.id) === form.categoryId) ?? null;

  const placement = selectedSub
    ? pathLabel(selectedSub)
    : selectedCategory
    ? `${selectedCategory.name}${PATH_SEPARATOR}(directly in the category)`
    : null;

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  // A sub-category cannot straddle two categories, so switching category drops
  // the selected one.
  function updateCategory(value) {
    setForm((prev) => ({ ...prev, categoryId: value, subcategoryId: "" }));
    setErrors((prev) => ({
      ...prev,
      categoryId: undefined,
      subcategoryId: undefined
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    const clientErrors = {};

    if (!form.name.trim()) clientErrors.name = "Material name is required";
    if (!form.code.trim()) clientErrors.code = "Item code is required";
    if (!form.categoryId && !form.subcategoryId) {
      clientErrors.categoryId = "Pick a category or a sub-category";
    }
    if (!form.uom) clientErrors.uom = "Unit of measure is required";

    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      return;
    }

    try {
      await onSubmit({
        code: form.code.trim(),
        name: form.name.trim(),
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        subcategoryId: form.subcategoryId ? Number(form.subcategoryId) : null,
        uom: form.uom,
        hsn: form.hsn.trim() || "-",
        gst: form.gst || "-",
        status: form.status
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
    <form onSubmit={handleSubmit} className="material-form">
      <div className="form-grid">
        <div className="form-field full">
          <label>Material name *</label>
          <input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. OPC 53 Grade Cement"
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>

        <div className="form-field">
          <label>Item code *</label>
          <input
            value={form.code}
            onChange={(e) => update("code", e.target.value)}
            placeholder="e.g. MAT-002-1-001"
          />
          {errors.code ? (
            <span className="field-error">{errors.code}</span>
          ) : (
            <span className="field-hint">Unique, case-insensitive.</span>
          )}
        </div>

        <div className="form-field">
          <label>UOM *</label>
          <select
            value={form.uom}
            onChange={(e) => update("uom", e.target.value)}
          >
            <option value="">Select UOM</option>
            {UOM_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((uom) => (
                  <option key={uom.value} value={uom.value}>
                    {uom.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {errors.uom && <span className="field-error">{errors.uom}</span>}
        </div>

        <div className="form-field">
          <label>Category *</label>
          <select
            value={form.categoryId}
            onChange={(e) => updateCategory(e.target.value)}
          >
            <option value="">Select category</option>
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
          <label>Sub-category</label>
          <select
            value={form.subcategoryId}
            disabled={!availableSubs.length}
            onChange={(e) => update("subcategoryId", e.target.value)}
          >
            <option value="">
              {!form.categoryId
                ? "Select a category first"
                : availableSubs.length
                ? "None — sits directly in the category"
                : "No sub-categories"}
            </option>
            {availableSubs.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {"  ".repeat(Math.max(0, sub.depth - 1))}
                {sub.depth > 1 ? "└ " : ""}
                {sub.name}
              </option>
            ))}
          </select>
          {errors.subcategoryId && (
            <span className="field-error">{errors.subcategoryId}</span>
          )}
        </div>

        <div className="form-field">
          <label>HSN</label>
          <input
            value={form.hsn}
            onChange={(e) => update("hsn", e.target.value)}
            placeholder="e.g. 2523"
          />
          {errors.hsn && <span className="field-error">{errors.hsn}</span>}
        </div>

        <div className="form-field">
          <label>GST</label>
          <select
            value={form.gst}
            onChange={(e) => update("gst", e.target.value)}
          >
            <option value="">Not set</option>
            {GST_OPTIONS.map((rate) => (
              <option key={rate} value={rate}>
                {rate}
              </option>
            ))}
          </select>
          {errors.gst && <span className="field-error">{errors.gst}</span>}
        </div>

        <div className="form-field">
          <label>Status</label>
          <select
            value={form.status}
            onChange={(e) => update("status", e.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.status && <span className="field-error">{errors.status}</span>}
        </div>
      </div>

      {placement && (
        <div className="path-preview">
          <span>Filed under</span>
          <code>{placement}</code>
        </div>
      )}

      {formError && <div className="form-error">{formError}</div>}

      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" disabled={submitting}>
          {submitting ? "Saving..." : material ? "Save changes" : "Add material"}
        </button>
      </div>
    </form>
  );
}
