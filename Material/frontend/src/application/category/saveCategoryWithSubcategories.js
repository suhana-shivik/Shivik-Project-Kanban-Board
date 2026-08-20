// One pass of the "add" modal.
//
// Sub-categories nest with no depth limit, so a single save can start anywhere
// in the tree: under a brand new category, under an existing category, or
// under an existing sub-category at any depth.
//
// The rows are either siblings (all under the same parent) or a chain, where
// each row is created inside the one created just before it — the quickest way
// to lay down a deep branch like Pipes › Round › 40mm in one go.
// It composes the single-resource use cases rather than the repositories, so
// "create a category" is written once, here and everywhere else alike.
export const saveCategoryWithSubcategories =
  ({ createCategory, updateCategory, createSubcategory }) =>
  async ({
    category = null,
    categoryId = null,
    parentId = null,
    rename = null,
    subcategories = [],
    nest = false
  }) => {
    let resolvedCategoryId = categoryId;
    let createdCategory = null;

    if (category) {
      createdCategory = await createCategory(category);
      resolvedCategoryId = createdCategory?.id ?? null;

      if (resolvedCategoryId == null) {
        throw {
          message:
            "The category was created but the API did not return its id, so its sub-categories could not be linked."
        };
      }
    } else if (rename && resolvedCategoryId != null) {
      await updateCategory(resolvedCategoryId, rename);
    }

    const createdSubcategories = [];

    // Only one placement key goes out per row. `parentId` alone lets the API
    // derive the category; sending both just adds a way to disagree and 400.
    let currentParentId = parentId;

    for (const subcategory of subcategories) {
      const placement =
        currentParentId != null
          ? { parentId: currentParentId }
          : { categoryId: resolvedCategoryId };

      const created = await createSubcategory({
        ...subcategory,
        ...placement
      });

      createdSubcategories.push(created);

      if (nest && created?.id != null) currentParentId = created.id;
    }

    const deepest = createdSubcategories[createdSubcategories.length - 1];
    const first = createdSubcategories[0];

    return {
      categoryId: resolvedCategoryId ?? deepest?.categoryId ?? null,
      // Prefill the material form with the leaf when a chain was created, and
      // with the single new row otherwise.
      subcategoryId: (nest ? deepest?.id : first?.id) ?? parentId ?? null,
      createdCategory,
      renamed: Boolean(rename),
      createdSubcategories
    };
  };
