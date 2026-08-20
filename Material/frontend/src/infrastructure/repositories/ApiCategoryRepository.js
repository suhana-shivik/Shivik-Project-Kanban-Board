import { apiClient } from "../http/apiClient";
import { buildQuery } from "../http/buildQuery";

export class ApiCategoryRepository {
  async getAll(filters = {}) {
    const query = buildQuery({
      query: filters.query?.trim(),
      status: filters.status
    });

    return apiClient(`/categories${query}`);
  }

  async getById(id) {
    return apiClient(`/categories/${id}`);
  }

  async getSubcategories(id) {
    return apiClient(`/categories/${id}/subcategories`);
  }

  async add(category) {
    return apiClient("/categories", {
      method: "POST",
      body: JSON.stringify(category)
    });
  }

  async update(id, category) {
    return apiClient(`/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(category)
    });
  }

  async remove(id) {
    return apiClient(`/categories/${id}`, { method: "DELETE" });
  }
}
