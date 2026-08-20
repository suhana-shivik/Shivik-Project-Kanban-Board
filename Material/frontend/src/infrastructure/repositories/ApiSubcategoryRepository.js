import { apiClient } from "../http/apiClient";
import { buildQuery } from "../http/buildQuery";

export class ApiSubcategoryRepository {
  // Flat array sorted by tree path, each row carrying parentId, depth and path.
  async getAll(filters = {}) {
    const query = buildQuery({
      categoryId: filters.categoryId,
      parentId: filters.parentId,
      rootOnly: filters.rootOnly ? "true" : undefined,
      query: filters.query?.trim(),
      status: filters.status
    });

    return apiClient(`/subcategories${query}`);
  }

  async getByCategory(categoryId) {
    return apiClient(`/categories/${categoryId}/subcategories`);
  }

  // Direct children only, one level down. 404s when the parent is gone, which
  // `getAll({ parentId })` would not.
  async getChildren(id) {
    return apiClient(`/subcategories/${id}/children`);
  }

  async getById(id) {
    return apiClient(`/subcategories/${id}`);
  }

  async add(subcategory) {
    return apiClient("/subcategories", {
      method: "POST",
      body: JSON.stringify(subcategory)
    });
  }

  async update(id, subcategory) {
    return apiClient(`/subcategories/${id}`, {
      method: "PUT",
      body: JSON.stringify(subcategory)
    });
  }

  async remove(id) {
    return apiClient(`/subcategories/${id}`, { method: "DELETE" });
  }
}
