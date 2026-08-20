import { descendantIdsOf } from "../../domain/services/categoryTree";

// Listing materials, including the one rule the API cannot express itself.
//
// The API filters by exactly one sub-category. Selecting a branch in the tree
// can mean "everything under here", and since sub-categories nest without limit
// that is potentially many ids — so the request is widened to the category and
// the result narrowed back down here.
//
// Both halves of that rule live in this file on purpose. It used to be split
// between the page (working out the ids) and the use case (applying them),
// which meant neither could be read on its own.
export const getMaterials =
  (repository) =>
  async (criteria = {}) => {
    // `subcategories` is the loaded tree, needed to resolve a branch into ids;
    // `includeNested` is the user's choice of whether to. Neither is a filter,
    // so neither goes to the API.
    const { subcategories = [], includeNested = false, ...filters } = criteria;

    const scope =
      filters.subcategoryId != null && includeNested
        ? descendantIdsOf(subcategories, filters.subcategoryId)
        : null;

    // A leaf resolves to just itself, which the API can filter on its own.
    if (!scope || scope.size <= 1) return repository.getAll(filters);

    const wanted = new Set([...scope].map(String));

    const materials = await repository.getAll({
      ...filters,
      subcategoryId: undefined
    });

    return (materials ?? []).filter((material) =>
      wanted.has(String(material.subcategoryId))
    );
  };
