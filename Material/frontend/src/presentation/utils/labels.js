// Turning a record into the text on screen. Nothing here decides anything —
// the structure and the rules live in `domain/services/categoryTree.js`.

export const PATH_SEPARATOR = " › ";

// "Steel & Metals › Pipes › Round Pipes" — the API's own path, joined.
export function pathLabel(subcategory, { includeCategory = true } = {}) {
  const path = subcategory?.path;

  if (!Array.isArray(path) || !path.length) {
    return subcategory?.name ?? "";
  }

  return (includeCategory ? path : path.slice(1)).join(PATH_SEPARATOR);
}

// The chain of sub-category names only, without the category at the front.
export function subPathLabel(subcategory) {
  return pathLabel(subcategory, { includeCategory: false });
}
