// The shape of the category hierarchy, and the rules that govern it.
//
// Categories and sub-categories are separate resources, and sub-categories nest
// inside each other with no depth limit via `parentId`. Every row the API
// returns already carries `depth` and `path`, so nothing here walks parents to
// work out where something sits — it only answers questions about the shape.
//
// This is domain knowledge, not display: "what is beneath this node" and "where
// may this node move" are true regardless of how they are rendered. Turning any
// of it into text belongs in `presentation/utils/labels.js`.

function indexByParent(subcategories) {
  const byParent = new Map();

  subcategories.forEach((subcategory) => {
    // A row sitting at the top of a category has no parent sub-category, so it
    // is nobody's descendant. Indexing those under `null` would make a lookup
    // for a null id answer with the entire tree.
    if (subcategory.parentId == null) return;

    const siblings = byParent.get(subcategory.parentId);

    if (siblings) siblings.push(subcategory);
    else byParent.set(subcategory.parentId, [subcategory]);
  });

  return byParent;
}

// One category with its sub-categories nested by parentId, recursively.
export function composeTree(categories = [], subcategories = []) {
  const byParent = new Map();
  const roots = new Map();

  subcategories.forEach((subcategory) => {
    const map = subcategory.parentId == null ? roots : byParent;
    const key =
      subcategory.parentId == null ? subcategory.categoryId : subcategory.parentId;

    const siblings = map.get(key);

    if (siblings) siblings.push(subcategory);
    else map.set(key, [subcategory]);
  });

  const attach = (subcategory) => ({
    ...subcategory,
    children: (byParent.get(subcategory.id) ?? []).map(attach)
  });

  return categories.map((category) => ({
    ...category,
    children: (roots.get(category.id) ?? []).map(attach)
  }));
}

// Every sub-category under a category, at any depth, in tree order.
export function flattenSubcategories(subcategories = [], categoryId) {
  const scoped =
    categoryId == null || categoryId === ""
      ? subcategories
      : subcategories.filter(
          (subcategory) => String(subcategory.categoryId) === String(categoryId)
        );

  return [...scoped].sort((a, b) =>
    pathKey(a).localeCompare(pathKey(b), undefined, { numeric: true })
  );
}

function pathKey(subcategory) {
  return (subcategory.path ?? [subcategory.name]).join(" ");
}

// A sub-category plus everything beneath it. Used to scope the material list to
// a whole branch, and to keep a move from creating a cycle.
//
// One pass to index the list by parent, then a walk down from the root — the
// list is in tree order but a child can still sort before its parent, and
// indexing first avoids re-scanning the whole list for every level.
export function descendantIdsOf(subcategories = [], subcategoryId) {
  const byParent = indexByParent(subcategories);
  const ids = new Set([subcategoryId]);
  const queue = [subcategoryId];

  while (queue.length) {
    const children = byParent.get(queue.pop());
    if (!children) continue;

    children.forEach((child) => {
      if (ids.has(child.id)) return;

      ids.add(child.id);
      queue.push(child.id);
    });
  }

  return ids;
}

export function countDescendants(subcategories = [], subcategoryId) {
  return descendantIdsOf(subcategories, subcategoryId).size - 1;
}

// Where a sub-category is allowed to move. The API refuses a move onto itself
// or onto one of its own children (400), so both are filtered out here rather
// than offered and then rejected.
export function moveTargetsFor(subcategories = [], subcategory) {
  if (!subcategory) return [];

  const blocked = descendantIdsOf(subcategories, subcategory.id);

  return flattenSubcategories(subcategories, subcategory.categoryId).filter(
    (candidate) => !blocked.has(candidate.id)
  );
}

// Narrow a composed tree to the nodes matching a search, keeping the ancestors
// that lead to a match so a deep hit is still shown in context.
export function filterTree(tree = [], query = "") {
  const needle = query.trim().toLowerCase();
  if (!needle) return tree;

  const matches = (node) =>
    node.name?.toLowerCase().includes(needle) ||
    node.code?.toLowerCase().includes(needle);

  const prune = (node) => {
    const children = (node.children ?? []).map(prune).filter(Boolean);

    // A matching node keeps its whole subtree — you searched for the branch,
    // so you get the branch.
    if (matches(node)) return { ...node, children: node.children ?? [] };
    if (children.length) return { ...node, children };

    return null;
  };

  return tree.map(prune).filter(Boolean);
}
