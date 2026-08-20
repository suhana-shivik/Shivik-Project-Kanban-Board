// The API reports failures in three shapes: `{ errors }` for validation,
// `{ reason }` for delete guards, and `{ message, requiredPermissions, role }`
// for a denied request. This flattens all of them into one sentence.
export function errorMessage(error, fallback = "Something went wrong.") {
  if (!error) return fallback;

  if (error.forbidden || error.status === 403) {
    const raw = error.message || "Your role is not allowed to perform this action";

    // The API's message has no trailing full stop, so one is added before the
    // permission is appended — this sentence is the whole explanation the user
    // gets for a blocked action, and it should read like one.
    const base = /[.!?]$/.test(raw) ? raw : `${raw}.`;

    return error.requiredPermissions
      ? `${base} Missing permission: ${error.requiredPermissions}.`
      : base;
  }

  if (error.reason) return error.reason;

  if (error.errors && typeof error.errors === "object") {
    const fields = Object.entries(error.errors)
      .map(([field, message]) => `${field}: ${message}`)
      .join(" · ");

    if (fields) return fields;
  }

  return error.message || fallback;
}

// A denial is worth a different toast colour than a broken request — it is not
// a fault, it is the system working.
export function toastFor(error, fallback) {
  return {
    type: error?.forbidden || error?.status === 403 ? "warning" : "error",
    message: errorMessage(error, fallback)
  };
}
