// The delete half of the same routing. Deletion is never recursive on either
// resource — the API refuses with 409 while anything is still underneath, so
// the tree empties from the leaves up.
export const deleteTreeNode =
  (deleteCategory, deleteSubcategory) =>
  ({ type, item }) =>
    type === "subcategory" ? deleteSubcategory(item.id) : deleteCategory(item.id);
