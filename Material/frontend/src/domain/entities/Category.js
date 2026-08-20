import { STATUS } from "../valueObjects/Status";

// PUT is a full replace — omitted fields reset to their defaults (`code` and
// `description` to null, `status` to Active). Editing just the name still has
// to send everything else back.
export function toCategoryPayload(category, changes = {}) {
  const next = { ...category, ...changes };

  // Trim before deciding, so a whitespace-only value clears the field instead
  // of being stored as an empty string.
  const code = String(next.code ?? "").trim();
  const description = String(next.description ?? "").trim();

  return {
    name: String(next.name ?? "").trim(),
    code: code || null,
    description: description || null,
    status: next.status ?? STATUS.ACTIVE
  };
}
