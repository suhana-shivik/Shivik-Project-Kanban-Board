import { useMemo, useState } from "react";
import { Filter, Plus, RefreshCw, Search, Upload } from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { Modal } from "../../components/common/Modal";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { Toast } from "../../components/common/Toast";
import { CategoryTree } from "../../components/categories/CategoryTree";
import { CategoryForm } from "../../components/categories/CategoryForm";
import { CategoryEditForm } from "../../components/categories/CategoryEditForm";
import { MaterialForm } from "../../components/materials/MaterialForm";
import { MaterialFilters } from "../../components/materials/MaterialFilters";
import { MaterialTable } from "../../components/materials/MaterialTable";
import { BulkImport } from "../../components/materials/BulkImport";
import { useResource } from "../../hooks/useResource";
import { toastFor } from "../../utils/apiError";
import { countDescendants } from "../../../domain/services/categoryTree";
import { pathLabel } from "../../utils/labels";

const noSelection = { categoryId: null, subcategoryId: null };
const noTarget = { categoryId: null, parentId: null };

export function MaterialPage({
  deps,
  user,
  onSignOut,
  page,
  onNavigate,
  showImport,
  setShowImport
}) {
  const {
    data: materials,
    loading,
    error: materialError,
    reload: loadMaterials
  } = useResource(deps.materials.getAll);

  const {
    data: categories,
    error: categoryError,
    reload: loadCategories
  } = useResource(deps.categories.getAll);

  const {
    data: subcategories,
    error: subcategoryError,
    reload: loadSubcategories
  } = useResource(deps.subcategories.getAll);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [uom, setUom] = useState("");
  const [selection, setSelection] = useState(noSelection);
  const [includeNested, setIncludeNested] = useState(true);
  const [treeFilter, setTreeFilter] = useState("");

  const [materialModal, setMaterialModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [materialPrefill, setMaterialPrefill] = useState(noSelection);
  const [materialSubmitting, setMaterialSubmitting] = useState(false);

  const [categoryModal, setCategoryModal] = useState(false);
  const [categoryTarget, setCategoryTarget] = useState(noTarget);
  const [categorySubmitting, setCategorySubmitting] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [deleteMaterialTarget, setDeleteMaterialTarget] = useState(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState(null);

  const [toast, setToast] = useState(null);

  const selectedSub = useMemo(
    () =>
      selection.subcategoryId == null
        ? null
        : subcategories.find((s) => s.id === selection.subcategoryId) ?? null,
    [selection.subcategoryId, subcategories]
  );

  const nestedCount = selectedSub
    ? countDescendants(subcategories, selectedSub.id)
    : 0;

  const selectionLabel = useMemo(() => {
    if (selectedSub) return pathLabel(selectedSub);
    if (selection.categoryId != null) {
      return categories.find((c) => c.id === selection.categoryId)?.name;
    }
    return null;
  }, [selectedSub, selection.categoryId, categories]);

  const deepest = useMemo(
    () => subcategories.reduce((max, s) => Math.max(max, s.depth ?? 1), 0),
    [subcategories]
  );

  // What the user is looking at. Resolving a branch selection into ids is the
  // use case's job, so it gets the tree and the choice, not a finished query.
  async function refresh(overrides = {}) {
    await loadMaterials({
      query,
      status,
      uom,
      categoryId: selection.categoryId,
      subcategoryId: selection.subcategoryId,
      includeNested,
      subcategories,
      ...overrides
    });
  }

  async function reloadCategoryData() {
    await Promise.all([loadCategories(), loadSubcategories()]);
  }

  function openAddMaterial() {
    console.log("her")
    console.log("her")
    setEditingMaterial(null);
    setMaterialPrefill(selection);
    setMaterialModal(true);
  }

  function openEditMaterial(material) {
    setEditingMaterial(material);
    setMaterialPrefill(noSelection);
    setMaterialModal(true);
  }

  async function handleMaterialSubmit(payload) {
    setMaterialSubmitting(true);

    try {
      if (editingMaterial) {
        await deps.materials.update(editingMaterial.id, payload);
        setToast({ type: "success", message: "Material updated successfully." });
      } else {
        await deps.materials.create(payload);
        setToast({ type: "success", message: "Material added successfully." });
      }

      setMaterialModal(false);
      await refresh();
    } finally {
      setMaterialSubmitting(false);
    }
  }

  async function handleDeleteMaterial() {
    try {
      await deps.materials.delete(deleteMaterialTarget.id);
      setDeleteMaterialTarget(null);
      setToast({ type: "success", message: "Material deleted successfully." });
      await refresh();
    } catch (err) {
      setDeleteMaterialTarget(null);
      setToast(toastFor(err, "Unable to delete material."));
    }
    }

    async function handleToggle(material) {
      try {
        await deps.materials.toggleStatus(material.id);
        await refresh();
      } catch (err) {
        setToast(toastFor(err, "Unable to change status."));
      }
    }

    function openAdd(target) {
      setCategoryTarget(target);
      setCategoryModal(true);
    }

    async function handleCategorySubmit(payload) {
      setCategorySubmitting(true);

    try {
      const result = await deps.categories.saveWithSubcategories(payload);

      setCategoryModal(false);
      await reloadCategoryData();

      const parts = [];
      if (result.createdCategory) parts.push("Category created");
      if (result.renamed) parts.push("Category renamed");
      if (result.createdSubcategories.length) {
        parts.push(
          `${result.createdSubcategories.length} sub-categor${
            result.createdSubcategories.length === 1 ? "y" : "ies"
          } added`
        );
      }

      const saved = parts.join(", ") || "Saved";

      setToast({
        type: "success",
        message: `${saved}. Now add a material.`
      });

      setEditingMaterial(null);
      setMaterialPrefill({
        categoryId: result.categoryId,
        subcategoryId: result.subcategoryId
      });
      setMaterialModal(true);
    } finally {
      setCategorySubmitting(false);
    }
  }

  async function handleEditSubmit(node) {
    setEditSubmitting(true);

    try {
      await deps.tree.save(node);

      setEditTarget(null);
      setToast({ type: "success", message: "Saved successfully." });
      await reloadCategoryData();
      await refresh();
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDeleteCategory() {
    const { type, item } = deleteCategoryTarget;

    try {
      await deps.tree.delete(deleteCategoryTarget);

      setDeleteCategoryTarget(null);
      setToast({ type: "success", message: "Deleted successfully." });
      await reloadCategoryData();

      const clears =
        type === "subcategory"
          ? selection.subcategoryId === item.id
          : selection.categoryId === item.id;

      if (clears) {
        setSelection(noSelection);
        await refresh({ categoryId: null, subcategoryId: null });
      }
    } catch (err) {
      setDeleteCategoryTarget(null);
      // Delete guards come back as { reason }, which says exactly what is
      // still in the way; a denial comes back as a 403 with the permission.
      setToast(toastFor(err, "This item cannot be deleted."));
    }
  }

  async function clearFilters() {
    setQuery("");
    setStatus("");
    setUom("");
    setSelection(noSelection);
    await loadMaterials({});
  }

  async function handleSelect(next) {
    setSelection(next);
    setIncludeNested(true);
    await refresh({ ...next, includeNested: true });
  }

  async function toggleNested(next) {
    setIncludeNested(next);
    await refresh({ includeNested: next });
  }

  async function handleImport(rows) {
    const response = await deps.materials.bulkImport(rows);
    await refresh();
    return response;
  }

  const fatalError = materialError || categoryError || subcategoryError;

  const deleteGuardHint =
    deleteCategoryTarget?.type === "subcategory"
      ? "Deletion is never recursive — anything still inside it has to go first."
      : "The API refuses this while sub-categories or materials are still assigned.";

  return (
    <AppShell
      user={user}
      onSignOut={onSignOut}
      page={page}
      onNavigate={onNavigate}
      offline={Boolean(fatalError)}
    >
        <header className="topbar">
          <div>
            <div className="breadcrumb">Master Data / Materials</div>
            <h1>Materials</h1>
          </div>

          <div className="top-actions">
            <button
              className="button secondary"
              onClick={() => setShowImport(true)}
            >
              <Upload size={16} />
              Import
            </button>

            <button className="button primary" onClick={openAddMaterial}>
              <Plus size={17} />
              Add material
            </button>
          </div>
        </header>

        <section className="content-grid">
          <aside className="category-panel">
            <div className="panel-header">
              <div>
                <h3>Categories</h3>
                <span>
                  {categories.length} categories · {subcategories.length} sub
                  {deepest > 1 ? ` · ${deepest} levels deep` : ""}
                </span>
              </div>

              <button
                className="tiny-button"
                title="Add category"
                onClick={() => openAdd(noTarget)}
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="tree-search">
              <Search size={14} />
              <input
                value={treeFilter}
                onChange={(e) => setTreeFilter(e.target.value)}
                placeholder="Find a category..."
              />
            </div>

            <CategoryTree
              categories={categories}
              subcategories={subcategories}
              selection={selection}
              filter={treeFilter}
              onSelect={handleSelect}
              onAdd={openAdd}
              onEdit={setEditTarget}
              onDelete={setDeleteCategoryTarget}
            />
          </aside>

          <section className="materials-panel">
            <div className="panel-toolbar">
              <MaterialFilters
                query={query}
                setQuery={setQuery}
                status={status}
                setStatus={setStatus}
                uom={uom}
                setUom={setUom}
                onSearch={() => refresh()}
                onClear={clearFilters}
              />

              <div className="toolbar-right">
                <button
                  className="icon-button"
                  onClick={() => refresh()}
                  title="Refresh"
                >
                  <RefreshCw size={17} />
                </button>
                <button
                  className="button filter-button"
                  onClick={() => refresh()}
                >
                  <Filter size={15} />
                  Apply
                </button>
              </div>
            </div>

            {selectionLabel && (
              <div className="active-filter">
                <span>
                  {selectedSub ? "Sub-category" : "Category"}:{" "}
                  <strong>{selectionLabel}</strong>
                </span>

                <div className="active-filter-right">
                  {nestedCount > 0 && (
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={includeNested}
                        onChange={(e) => toggleNested(e.target.checked)}
                      />
                      Include {nestedCount} nested
                    </label>
                  )}
                  <button
                    aria-label="Clear selection"
                    onClick={() => handleSelect(noSelection)}
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {fatalError && (
              <div className="api-error">
                <strong>Unable to load data.</strong>
                <span>
                  {fatalError.message ||
                    "Make sure your backend is running and reachable."}
                </span>
              </div>
            )}

            <MaterialTable
              materials={materials}
              subcategories={subcategories}
              loading={loading}
              onEdit={openEditMaterial}
              onDelete={setDeleteMaterialTarget}
              onToggle={handleToggle}
            />
          </section>
        </section>

      <Modal
        open={materialModal}
        title={editingMaterial ? "Edit material" : "Add material"}
        onClose={() => setMaterialModal(false)}
        width={720}
      >
        <MaterialForm
          material={editingMaterial}
          categories={categories}
          subcategories={subcategories}
          initialCategoryId={materialPrefill.categoryId}
          initialSubcategoryId={materialPrefill.subcategoryId}
          onSubmit={handleMaterialSubmit}
          onCancel={() => setMaterialModal(false)}
          submitting={materialSubmitting}
        />
      </Modal>

      <Modal
        open={categoryModal}
        title={
          categoryTarget.parentId != null
            ? "Add sub-category inside this one"
            : "Add category / sub-category"
        }
        onClose={() => setCategoryModal(false)}
        width={560}
      >
        <CategoryForm
          categories={categories}
          subcategories={subcategories}
          initialCategoryId={categoryTarget.categoryId}
          initialParentId={categoryTarget.parentId}
          onSubmit={handleCategorySubmit}
          onCancel={() => setCategoryModal(false)}
          submitting={categorySubmitting}
        />
      </Modal>

      <Modal
        open={Boolean(editTarget)}
        title={
          editTarget?.type === "subcategory"
            ? "Edit sub-category"
            : "Edit category"
        }
        onClose={() => setEditTarget(null)}
        width={560}
      >
        <CategoryEditForm
          target={editTarget}
          categories={categories}
          subcategories={subcategories}
          onSubmit={handleEditSubmit}
          onCancel={() => setEditTarget(null)}
          submitting={editSubmitting}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteMaterialTarget)}
        title="Delete material"
        message={`Are you sure you want to delete "${deleteMaterialTarget?.name}"? This action cannot be undone.`}
        onClose={() => setDeleteMaterialTarget(null)}
        onConfirm={handleDeleteMaterial}
      />

      <ConfirmDialog
        open={Boolean(deleteCategoryTarget)}
        title={
          deleteCategoryTarget?.type === "subcategory"
            ? "Delete sub-category"
            : "Delete category"
        }
        message={`Delete "${
          deleteCategoryTarget?.item?.name ?? ""
        }"? ${deleteGuardHint}`}
        onClose={() => setDeleteCategoryTarget(null)}
        onConfirm={handleDeleteCategory}
      />

      <BulkImport
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </AppShell>
  );
}
