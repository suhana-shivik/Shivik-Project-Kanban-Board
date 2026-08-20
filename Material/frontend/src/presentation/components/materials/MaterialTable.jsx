import { useMemo } from "react";
import { Edit2, Trash2 } from "lucide-react";
import { subPathLabel } from "../../utils/labels";
import { TableState } from "../common/TableState";

export function MaterialTable({
  materials,
  subcategories = [],
  loading,
  onEdit,
  onDelete,
  onToggle
}) {
  // Materials come back with a resolved `subcategoryName` but not the branch it
  // sits on, and a bare name is ambiguous once sub-categories nest — two
  // categories can both hold a "Flats". The full path is joined back on here.
  const pathById = useMemo(() => {
    const map = new Map();
    subcategories.forEach((sub) => map.set(String(sub.id), subPathLabel(sub)));
    return map;
  }, [subcategories]);

  if (loading || !materials.length) {
    return (
      <TableState
        loading={loading}
        loadingText="Loading materials..."
        title="No materials found"
        hint="Try changing your search or add a new material."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ITEM CODE</th>
            <th>MATERIAL</th>
            <th>CATEGORY</th>
            <th>SUB-CATEGORY</th>
            <th>UOM</th>
            <th>HSN</th>
            <th>GST</th>
            <th>STATUS</th>
            <th className="action-head"></th>
          </tr>
        </thead>
        <tbody>
          {materials.map((material) => {
            const path =
              material.subcategoryId != null
                ? pathById.get(String(material.subcategoryId))
                : null;

            return (
              <tr key={material.id}>
                <td>
                  <span className="code">{material.code}</span>
                </td>
                <td>
                  <div className="material-name">{material.name}</div>
                </td>
                <td>{material.categoryName || "—"}</td>
                <td>
                  {path ? (
                    <span className="sub-path" title={path}>
                      {path}
                    </span>
                  ) : (
                    material.subcategoryName || "—"
                  )}
                </td>
                <td>
                  <span className="uom-pill">{material.uom}</span>
                </td>
                <td>{material.hsn || "—"}</td>
                <td>{material.gst || "—"}</td>
                <td>
                  <button
                    className={`status-pill ${material.status.toLowerCase()}`}
                    onClick={() => onToggle(material)}
                    title="Toggle status"
                  >
                    <span className="status-dot" />
                    {material.status}
                  </button>
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      className="tiny-icon"
                      onClick={() => onEdit(material)}
                      title="Edit"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      className="tiny-icon danger-icon"
                      onClick={() => onDelete(material)}
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
