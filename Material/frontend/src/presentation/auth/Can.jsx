import { useSession } from "./AuthContext";

// Renders its children only when the signed-in role holds the permission.
// `any` switches the check from "all of these" to "at least one of these",
// which is what a container needs when it holds several different actions.
export function Can({ permission, any = false, fallback = null, children }) {
  const { can, canAny } = useSession();
  const allowed = any ? canAny(permission) : can(permission);

  if (!allowed) return fallback;

  return typeof children === "function" ? children() : children;
}

// A button whose permission is part of its definition.
//
// Denied controls stay on screen but disabled, with the reason on hover — a
// blocked button that explains itself beats one that silently vanished. Pass
// `hideWhenDenied` where a row of icons would otherwise become a row of dead
// ones, and the control disappears instead.
export function GuardedButton({
  permission,
  hideWhenDenied = false,
  className = "button",
  type = "button",
  title,
  onClick,
  disabled = false,
  children,
  ...rest
}) {
  const { can, reasonFor } = useSession();
  const allowed = can(permission);

  if (!allowed && hideWhenDenied) return null;

  // A denied button is deliberately NOT given the `disabled` attribute:
  // browsers swallow mouse events on disabled controls, so the title tooltip —
  // the entire reason for leaving the button on screen — would never appear,
  // and screen readers skip it. `aria-disabled` plus no handler makes it inert
  // while keeping it focusable and able to explain itself.
  return (
    <button
      {...rest}
      type={type}
      className={`${className}${allowed ? "" : " permission-denied"}`}
      title={allowed ? title : reasonFor(permission)}
      aria-disabled={allowed ? undefined : true}
      disabled={allowed ? disabled : undefined}
      onClick={allowed ? onClick : undefined}
    >
      {children}
    </button>
  );
}
