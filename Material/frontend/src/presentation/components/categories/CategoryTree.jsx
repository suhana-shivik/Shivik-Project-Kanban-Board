import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Layers,
  Pencil,
  Plus,
  Trash2
} from "lucide-react";
import { composeTree, filterTree } from "../../../domain/services/categoryTree";
import { isInactive } from "../../../domain/valueObjects/Status";

function sameSelection(a, b) {
  return a.categoryId === b.categoryId && a.subcategoryId === b.subcategoryId;
}

const keyOf = (type, id) => `${type}:${id}`;

// A sub-category at any depth. Renders its own children through itself, which
// is the whole reason the tree can go as deep as the API allows.
function SubcategoryNode({
  node,
  categoryId,
  selection,
  isExpanded,
  onToggleExpand,
  onSelect,
  onAdd,
  onEdit,
  onDelete
}) {
  const hasChildren = node.children.length > 0;
  const open = isExpanded(keyOf("s", node.id));

  const selected = sameSelection(selection, {
    categoryId,
    subcategoryId: node.id
  });

  return (
    <div>
      <div
        className={`category-node ${selected ? "selected" : ""}`}
        onClick={() => onSelect({ categoryId, subcategoryId: node.id })}
      >
        <button
          className="tree-toggle"
          aria-label={hasChildren ? (open ? "Collapse" : "Expand") : undefined}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(keyOf("s", node.id));
          }}
        >
          {hasChildren ? (
            open ? <ChevronDown size={15} /> : <ChevronRight size={15} />
          ) : (
            <span className="tree-spacer" />
          )}
        </button>

        <Folder size={15} className="folder-icon sub" />

        <span className="category-name">{node.name}</span>

        {hasChildren && !open && (
          <span className="child-count">{node.children.length}</span>
        )}
        {node.code && <span className="node-code">{node.code}</span>}
        {isInactive(node) && <span className="node-muted">off</span>}

        <div className="node-actions">
          <button
            className="tiny-icon"
            title="Add sub-category inside this one"
            onClick={(e) => {
              e.stopPropagation();
              onAdd({ categoryId, parentId: node.id });
            }}
          >
            <Plus size={14} />
          </button>
          <button
            className="tiny-icon"
            title="Edit sub-category"
            onClick={(e) => {
              e.stopPropagation();
              onEdit({ type: "subcategory", item: node });
            }}
          >
            <Pencil size={14} />
          </button>
          <button
            className="tiny-icon danger-icon"
            title="Delete sub-category"
            onClick={(e) => {
              e.stopPropagation();
              onDelete({ type: "subcategory", item: node });
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {open && hasChildren && (
        <div className="category-children">
          {node.children.map((child) => (
            <SubcategoryNode
              key={child.id}
              node={child}
              categoryId={categoryId}
              selection={selection}
              isExpanded={isExpanded}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryNode({
  category,
  selection,
  isExpanded,
  onToggleExpand,
  onSelect,
  onAdd,
  onEdit,
  onDelete
}) {
  const hasChildren = category.children.length > 0;
  const open = isExpanded(keyOf("c", category.id));

  const selected = sameSelection(selection, {
    categoryId: category.id,
    subcategoryId: null
  });

  return (
    <div>
      <div
        className={`category-node root ${selected ? "selected" : ""}`}
        onClick={() =>
          onSelect({ categoryId: category.id, subcategoryId: null })
        }
      >
        <button
          className="tree-toggle"
          aria-label={hasChildren ? (open ? "Collapse" : "Expand") : undefined}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(keyOf("c", category.id));
          }}
        >
          {hasChildren ? (
            open ? <ChevronDown size={15} /> : <ChevronRight size={15} />
          ) : (
            <span className="tree-spacer" />
          )}
        </button>

        {open && hasChildren ? (
          <FolderOpen size={16} className="folder-icon" />
        ) : (
          <Folder size={16} className="folder-icon" />
        )}

        <span className="category-name">{category.name}</span>

        {hasChildren && !open && (
          <span className="child-count">{category.children.length}</span>
        )}
        {category.code && <span className="node-code">{category.code}</span>}
        {isInactive(category) && (
          <span className="node-muted">off</span>
        )}

        <div className="node-actions">
          <button
            className="tiny-icon"
            title="Add sub-category in this category"
            onClick={(e) => {
              e.stopPropagation();
              onAdd({ categoryId: category.id, parentId: null });
            }}
          >
            <Plus size={14} />
          </button>
          <button
            className="tiny-icon"
            title="Edit category"
            onClick={(e) => {
              e.stopPropagation();
              onEdit({ type: "category", item: category });
            }}
          >
            <Pencil size={14} />
          </button>
          <button
            className="tiny-icon danger-icon"
            title="Delete category"
            onClick={(e) => {
              e.stopPropagation();
              onDelete({ type: "category", item: category });
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {open && hasChildren && (
        <div className="category-children">
          {category.children.map((child) => (
            <SubcategoryNode
              key={child.id}
              node={child}
              categoryId={category.id}
              selection={selection}
              isExpanded={isExpanded}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryTree({
  categories,
  subcategories,
  selection,
  filter = "",
  onSelect,
  onAdd,
  onEdit,
  onDelete
}) {
  const tree = useMemo(
    () => composeTree(categories, subcategories),
    [categories, subcategories]
  );

  const searching = filter.trim().length > 0;

  const visible = useMemo(
    () => (searching ? filterTree(tree, filter) : tree),
    [tree, filter, searching]
  );

  const [collapsed, setCollapsed] = useState(() => new Set());

  // Everything starts open, so a new branch is visible the moment it is
  // created. Only what the user explicitly closes is remembered.
  function isExpanded(key) {
    return searching || !collapsed.has(key);
  }

  function toggleExpand(key) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const showingAll =
    selection.categoryId === null && selection.subcategoryId === null;

  if (searching && !visible.length) {
    return (
      <div className="category-tree">
        <div className="tree-empty">
          <span>No category or sub-category matches “{filter.trim()}”.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="category-tree">
      <button
        className={`category-all ${showingAll ? "selected" : ""}`}
        onClick={() => onSelect({ categoryId: null, subcategoryId: null })}
      >
        <Layers size={16} />
        <span>All categories</span>
      </button>

      {!categories.length && (
        <div className="tree-empty">
          <span>No categories yet. Use + above to create the first one.</span>
        </div>
      )}

      {visible.map((category) => (
        <CategoryNode
          key={category.id}
          category={category}
          selection={selection}
          isExpanded={isExpanded}
          onToggleExpand={toggleExpand}
          onSelect={onSelect}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
