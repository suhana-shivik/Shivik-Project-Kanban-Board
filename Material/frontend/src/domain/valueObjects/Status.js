// Every record the API keeps — category, sub-category, material, user — is
// either Active or Inactive, spelled exactly like this. The words were repeated
// across nine files; they are defined once here so a form, a filter and a
// payload default cannot drift apart.
export const STATUS = Object.freeze({
  ACTIVE: "Active",
  INACTIVE: "Inactive"
});

// What a status picker offers, in order.
export const STATUS_OPTIONS = Object.freeze([
  { value: STATUS.ACTIVE, label: "Active" },
  { value: STATUS.INACTIVE, label: "Inactive" }
]);

export function isInactive(record) {
  return record?.status === STATUS.INACTIVE;
}
