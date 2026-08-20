import { apiClient } from "../http/apiClient";
import { buildQuery } from "../http/buildQuery";

export class ApiMaterialRepository {
  async getAll(filters = {}) {
    const query = buildQuery({
      query: filters.query?.trim(),
      categoryId: filters.categoryId,
      subcategoryId: filters.subcategoryId,
      uom: filters.uom,
      status: filters.status
    });

    return apiClient(`/materials${query}`);
  }

  async getById(id) {
    return apiClient(`/materials/${id}`);
  }

  async add(material) {
    return apiClient("/materials", {
      method: "POST",
      body: JSON.stringify(material)
    });
  }

  async update(id, material) {
    return apiClient(`/materials/${id}`, {
      method: "PUT",
      body: JSON.stringify(material)
    });
  }

  async remove(id) {
    return apiClient(`/materials/${id}`, { method: "DELETE" });
  }

  // Empty body — the server flips Active <-> Inactive itself.
  async toggleStatus(id) {
    return apiClient(`/materials/${id}/status`, { method: "PATCH" });
  }

  async bulkImport(rows) {
    return apiClient("/materials/bulk-import", {
      method: "POST",
      body: JSON.stringify({ rows })
    });
  }
}
