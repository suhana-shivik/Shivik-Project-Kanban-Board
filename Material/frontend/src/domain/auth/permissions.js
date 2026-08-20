// The permission vocabulary the API speaks. Controllers there ask for
// `resource:action` and never for a role, so the frontend mirrors that: every
// gate in the UI names a permission, and the role only ever decides which
// permissions the signed-in user carries.

export const PERMISSIONS = {
  CATEGORY_READ: "category:read",
  CATEGORY_CREATE: "category:create",
  CATEGORY_UPDATE: "category:update",
  CATEGORY_DELETE: "category:delete",

  SUBCATEGORY_READ: "subcategory:read",
  SUBCATEGORY_CREATE: "subcategory:create",
  SUBCATEGORY_UPDATE: "subcategory:update",
  SUBCATEGORY_DELETE: "subcategory:delete",

  MATERIAL_READ: "material:read",
  MATERIAL_CREATE: "material:create",
  MATERIAL_UPDATE: "material:update",
  MATERIAL_DELETE: "material:delete",

  USER_READ: "user:read",
  USER_CREATE: "user:create",
  USER_UPDATE: "user:update",
  USER_DELETE: "user:delete",

  METRICS_READ: "metrics:read"
};

export const ROLES = {
  ADMIN: "admin",
  CATEGORY_MANAGER: "category_manager",
  MATERIAL_MANAGER: "material_manager",
  VIEWER: "viewer"
};

export const ROLE_LABELS = {
  [ROLES.ADMIN]: "Administrator",
  [ROLES.CATEGORY_MANAGER]: "Category manager",
  [ROLES.MATERIAL_MANAGER]: "Material manager",
  [ROLES.VIEWER]: "Viewer"
};

// What the role picker offers, in order of reach. The blurbs describe the
// consequence of the choice — the person assigning a role is deciding what
// someone can change, and should not have to read a permission matrix.
export const ASSIGNABLE_ROLES = [
  {
    role: ROLES.ADMIN,
    label: ROLE_LABELS[ROLES.ADMIN],
    summary: "Everything, including managing users and their roles."
  },
  {
    role: ROLES.CATEGORY_MANAGER,
    label: ROLE_LABELS[ROLES.CATEGORY_MANAGER],
    summary: "Adds and edits categories and sub-categories. Cannot touch materials."
  },
  {
    role: ROLES.MATERIAL_MANAGER,
    label: ROLE_LABELS[ROLES.MATERIAL_MANAGER],
    summary: "Adds and edits materials. Cannot change the category tree."
  },
  {
    role: ROLES.VIEWER,
    label: ROLE_LABELS[ROLES.VIEWER],
    summary: "Read-only. Can see everything, can change nothing."
  }
];

// Only used to phrase the "you are read-only" notice. The server stays the
// source of truth for what each role may actually do.
const WRITE_PERMISSIONS = [
  PERMISSIONS.CATEGORY_CREATE,
  PERMISSIONS.CATEGORY_UPDATE,
  PERMISSIONS.CATEGORY_DELETE,
  PERMISSIONS.SUBCATEGORY_CREATE,
  PERMISSIONS.SUBCATEGORY_UPDATE,
  PERMISSIONS.SUBCATEGORY_DELETE,
  PERMISSIONS.MATERIAL_CREATE,
  PERMISSIONS.MATERIAL_UPDATE,
  PERMISSIONS.MATERIAL_DELETE
];

// What a denied action is called in a sentence, so a disabled control can say
// "Your role cannot add materials" instead of leaking `material:create`.
const PERMISSION_PHRASES = {
  [PERMISSIONS.CATEGORY_CREATE]: "add categories",
  [PERMISSIONS.CATEGORY_UPDATE]: "edit categories",
  [PERMISSIONS.CATEGORY_DELETE]: "delete categories",
  [PERMISSIONS.SUBCATEGORY_CREATE]: "add sub-categories",
  [PERMISSIONS.SUBCATEGORY_UPDATE]: "edit sub-categories",
  [PERMISSIONS.SUBCATEGORY_DELETE]: "delete sub-categories",
  [PERMISSIONS.MATERIAL_CREATE]: "add materials",
  [PERMISSIONS.MATERIAL_UPDATE]: "edit materials",
  [PERMISSIONS.MATERIAL_DELETE]: "delete materials",
  [PERMISSIONS.USER_READ]: "view the user directory",
  [PERMISSIONS.USER_CREATE]: "add users",
  [PERMISSIONS.USER_UPDATE]: "edit users",
  [PERMISSIONS.USER_DELETE]: "delete users"
};

export function roleLabelOf(role) {
  return ROLE_LABELS[role] ?? role ?? "Unknown role";
}

export function permissionSetOf(user) {
  return new Set(Array.isArray(user?.permissions) ? user.permissions : []);
}

// Every one of them. No permissions asked for means "just be signed in".
export function can(user, ...required) {
  const flat = required.flat().filter(Boolean);
  if (!flat.length) return Boolean(user);

  const granted = permissionSetOf(user);
  return flat.every((permission) => granted.has(permission));
}

export function canAny(user, ...required) {
  const flat = required.flat().filter(Boolean);
  if (!flat.length) return Boolean(user);

  const granted = permissionSetOf(user);
  return flat.some((permission) => granted.has(permission));
}

export function isReadOnly(user) {
  return Boolean(user) && !canAny(user, WRITE_PERMISSIONS);
}

export function describePermissions(required) {
  const phrases = [required]
    .flat()
    .filter(Boolean)
    .map((permission) => PERMISSION_PHRASES[permission] ?? permission);

  if (!phrases.length) return "perform this action";
  if (phrases.length === 1) return phrases[0];

  return `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}

// The sentence a blocked control shows on hover, and the one a 403 toast falls
// back to when the API did not send its own message.
export function deniedReason(user, required) {
  return `Your role (${roleLabelOf(user?.role)}) cannot ${describePermissions(
    required
  )}.`;
}
