import { ROLES } from "../auth/permissions";
import { STATUS } from "../valueObjects/Status";

export function createUserEntity(data = {}) {
  const first = data.firstName ?? "";
  const last = data.lastName ?? "";

  return {
    id: data.id ?? null,
    name: data.name ?? `${first} ${last}`.trim(),
    email: data.email ?? "",
    role: data.role ?? ROLES.VIEWER,
    // The API resolves the role into a permission list on every response, so
    // the UI never has to keep its own copy of the role table.
    permissions: Array.isArray(data.permissions) ? data.permissions : [],
    status: data.status ?? STATUS.ACTIVE,
    profileImageUrl: data.profileImageUrl ?? null
  };
}

const idsOf = (value) =>
  (Array.isArray(value) ? value : [])
    .map((entry) => (entry && typeof entry === "object" ? entry.id : entry))
    .filter((id) => id != null)
    .map(Number);

// The "Add / Edit user" form as the API wants it, still as a plain object —
// turning it into multipart is the repository's job, not the domain's.
//
// `password` is dropped when blank: on edit that means "leave it alone", which
// is why editing a user never forces a reset. The three id lists are always
// present, because sending one empty is how the UI says "nothing selected".
export function toUserPayload(form = {}) {
  const password = String(form.password ?? "").trim();
  const phone = String(form.phone ?? "").trim();

  return {
    firstName: String(form.firstName ?? "").trim(),
    lastName: String(form.lastName ?? "").trim(),
    email: String(form.email ?? "").trim(),
    // An empty phone has to be left out entirely, not sent blank: the API
    // validates a present `phone` as exactly 10 digits, so "" fails. Omitting
    // it on a PUT clears it, which is what an emptied field means anyway.
    ...(phone ? { phone } : {}),
    role: form.role,
    status: form.status || STATUS.ACTIVE,
    departmentIds: idsOf(form.departmentIds),
    projectIds: idsOf(form.projectIds),
    managerIds: idsOf(form.managerIds),
    ...(password ? { password } : {}),
    profileImage: form.profileImage ?? null,
    signature: form.signature ?? null
  };
}

// Turns an API user row back into form state, so editing starts from what is
// actually stored rather than from blanks.
export function toUserForm(user) {
  return {
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    role: user?.role ?? ROLES.VIEWER,
    status: user?.status ?? STATUS.ACTIVE,
    departmentIds: idsOf(user?.departments),
    projectIds: idsOf(user?.projects),
    managerIds: idsOf(user?.reportingTo),
    password: "",
    profileImage: null,
    signature: null
  };
}

export function initialsOf(user) {
  const source = user?.name?.trim() || user?.email || "";

  const letters = source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]);

  return letters.join("").toUpperCase() || "?";
}
