// The category panel edits one kind of thing — a node in the tree — but the
// API keeps categories and sub-categories as separate resources. Which one a
// node is decides where its save goes, and that is a fact about the data, not
// about the screen showing it.
//
// It composes the single-resource use cases rather than reaching for the
// repositories, so the routing exists here and the update exists there.
export const saveTreeNode =
  (updateCategory, updateSubcategory) =>
  ({ type, id, payload }) =>
    type === "subcategory"
      ? updateSubcategory(id, payload)
      : updateCategory(id, payload);
