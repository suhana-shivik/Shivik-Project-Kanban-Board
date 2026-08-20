import { STATUS } from "../valueObjects/Status";

// Sub-categories nest inside a category *or inside another sub-category*, with
// no depth limit. The API resolves the tree for us: every row carries the
// derived `categoryId`, its `parentId`, and a ready-made `depth` / `path`, so
// nothing here has to walk parents to know where a row sits.
//
// PUT is a full replace: any field left out is reset to its default, and a
// missing `parentId` quietly moves the row back to the top of its category.
// Every update therefore has to send the whole record.
export function toSubcategoryPayload(subcategory, changes = {}) {
  const next = { ...subcategory, ...changes };

  // Trim before deciding, so a whitespace-only code clears the field instead of
  // being stored as an empty string.
  const code = String(next.code ?? "").trim();
  const description = String(next.description ?? "").trim();

  const payload = {
    name: String(next.name ?? "").trim(),
    code: code || null,
    description: description || null,
    status: next.status ?? STATUS.ACTIVE
  };

  // Send one placement key only — sending both makes the API check that they
  // agree, which is an extra way to fail for no gain.
  if (next.parentId != null) payload.parentId = Number(next.parentId);
  else payload.categoryId = Number(next.categoryId);

  return payload;
}
