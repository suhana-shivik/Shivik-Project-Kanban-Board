# Material ERP Frontend — Onion Architecture

## Requirements
- Node.js 18+ recommended
- The Material Master backend running (see `material-master.postman_collection.json`)

## Run

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal, normally:

http://localhost:5173

Sign in with one of the four seeded accounts — **all use the password
`123456`** — to see the same screen under each role:

| Email | Role | What you get |
| --- | --- | --- |
| `suhana@gmail.com` | admin | every action |
| `category@gmail.com` | category_manager | the category tree is editable, material actions are not |
| `material@gmail.com` | material_manager | material actions are live, the tree is read-only |
| `viewer@gmail.com` | viewer | read-only everywhere, with a "Read-only" chip in the toolbar |

## Backend
The frontend calls relative endpoints:

```
/api/auth/login                     (POST, public)
/api/auth/me                        (GET  — user + resolved permissions)
/api/auth/roles                     (GET, public — role catalogue)

/api/categories                     (GET ?query&status, POST)
/api/categories/:id                 (GET, PUT, DELETE)
/api/categories/:id/subcategories   (GET)

/api/subcategories                  (GET ?categoryId&parentId&rootOnly&query&status, POST)
/api/subcategories/:id              (GET, PUT, DELETE)
/api/subcategories/:id/children     (GET)

/api/materials                      (GET ?query&categoryId&subcategoryId&uom&status, POST)
/api/materials/:id                  (GET, PUT, DELETE)
/api/materials/:id/status           (PATCH)
/api/materials/bulk-import          (POST)

/api/users                          (GET ?query&role&status, POST multipart)
/api/users/:id                      (GET, PUT multipart, DELETE)
/api/users/:id/role                 (PATCH — { role })
/api/users/:id/status               (PATCH — no body, flips Active/Inactive)
/api/users/lookups                  (GET, public — departments + projects)
/api/users/managers                 (GET — the "reporting to" options)
```

The backend must be running, otherwise every request is answered by the Vite
dev server's fallback page and nothing can be loaded or saved.

Point the dev server at your backend by creating a `.env` file in the project
root:

```
VITE_API_TARGET=http://localhost:3000
```

`vite.config.js` reads that and proxies `/api` to it. Restart `npm run dev`
after changing it. Alternatively, change `BASE_URL` in:

src/infrastructure/http/apiClient.js

## Data model

```
category --< subcategory --< subcategory --< ... --< material
```

Categories and sub-categories are separate resources. **Sub-categories nest
inside each other with no depth limit** via `parentId`, and a material can hang
off a sub-category at any depth — or sit directly in a category.

Every sub-category the API returns carries `parentId`, `depth` and `path`
(category name first), so the UI renders the tree straight from the flat list
without walking parents itself.

Placing a sub-category — send **one** placement key:

- `parentId` → nests it, and the category is derived from the parent.
- `categoryId` → sits at the top of that category (`parentId: null`).
- Both → they must agree, or the API returns 400.

### PUT is a full replace

On categories, sub-categories and materials, any field left out of a PUT is
reset to its default. For a nested sub-category a missing `parentId` also means
"move to the top of the category". Updates therefore always go through
`toCategoryPayload` / `toSubcategoryPayload` in `src/domain/entities/`, which
rebuild the whole record from the current one plus the edits.

### Delete guards

Deletion is never recursive — the tree empties from the leaves up. A blocked
delete comes back as `409 { reason }`, and that reason is what the UI shows.

## Architecture

```
presentation -> application -> domain
                         ^
                         |
                  infrastructure
```

Dependencies point inward only, and that is checkable:

```bash
grep -rn "infrastructure\|presentation" src/application/   # must be empty
grep -rn "infrastructure" src/presentation/                # must be empty
grep -rn "^import" src/domain/                             # must stay inside domain/
```

React components never call fetch directly; all HTTP is isolated inside
`infrastructure/repositories`. `src/app/App.jsx` is the only composition root —
it builds every use case once and hands the pages a `deps` object, so nothing
below it ever constructs a repository.

### What lives where

**`domain/`** — facts that are true regardless of screen or transport.

| Path | Role |
| --- | --- |
| `services/categoryTree.js` | The hierarchy's shape and rules: compose, descendants, legal move targets, search |
| `valueObjects/Status.js` | Active / Inactive, defined once for every resource |
| `valueObjects/UOM.js` | The 28 units the API accepts, grouped |
| `auth/permissions.js` | The permission vocabulary and the role catalogue |
| `entities/*.js` | `toXPayload` — PUT is a full replace, so these rebuild the whole record |
| `repositories/*.js` | The ports. `SessionRepository` is why the use cases never see localStorage |

**`application/`** — one file per thing the user can do.

| Path | Role |
| --- | --- |
| `material/getMaterials.js` | Owns the branch-scope rule end to end: resolve descendants, widen the request, narrow the result |
| `category/saveCategoryWithSubcategories.js` | Creates a branch — siblings or a nested chain — in one pass |
| `tree/saveTreeNode.js`, `tree/deleteTreeNode.js` | Route a tree node to the category or sub-category use case |
| `auth/restoreSession.js` | Trades a stored token for the live user and permissions |

**`presentation/`** — screen state and formatting, nothing else.

| Path | Role |
| --- | --- |
| `hooks/useResource.js` | One list-loading hook for all four resources |
| `utils/labels.js` | `pathLabel` — turning a record's `path` into text |
| `utils/apiError.js` | Flattens `{ errors }`, `{ reason }` and 403 bodies into one sentence |
| `utils/csv.js` | Quote-aware CSV parsing for bulk import |
| `components/common/` | `SearchBox`, `StatusSelect`, `TableState`, `Modal`, `MultiSelect`, `Toast` — shared by both pages |

### The line between a handler and a use case

Page handlers such as `handleDeleteMaterial` stay in `presentation/` on purpose.
Strip one down and it is a single use-case call surrounded by *which modal is
open, what toast shows, when to refetch* — screen state that can only live where
React state lives. Moving it inward would mean passing `setToast` into the
application layer, inverting the arrow the pattern exists to protect.

The test for whether something belongs deeper: **would it survive swapping React
for something else?** A toast would not. "Everything beneath this node" would.

## CSV format

Required per row: `code`, `name`, `uom`, and at least one of `categoryId` /
`subcategoryId`. `hsn`, `gst` and `status` are optional. Leave a placement
column blank to have the API derive it. Max 5000 rows per import; the import
always returns 200 and reports per-row failures.

```csv
code,name,categoryId,subcategoryId,uom,hsn,gst,status
BULK-001,Bulk Item A,1,,m,7308,18%,Active
BULK-002,Bulk Item B,,3,bag,2523,28%,Active
```

The **Template** button in the import dialog downloads exactly this file.

## Authentication

`POST /api/auth/login` returns
`{ message, accessToken, tokenType, expiresIn, expiresAt, user }`. Every
business route is protected — without a bearer token the API answers **401**,
and with the wrong role **403**.

The token is the whole session. It lives in `localStorage` behind
`infrastructure/auth/tokenStorage.js`, and `apiClient` attaches it as
`Authorization: Bearer` to every call except the two public ones
(`/auth/login`, `/auth/roles`).

**A stored token is a claim, not a session.** On boot,
`application/auth/restoreSession.js` trades it for `GET /auth/me`, which returns
the live user *and* a freshly resolved permission list. So a role an admin
changed while the tab was closed is picked up on the next load rather than
leaving stale buttons on screen. The app renders a boot screen until that
resolves, so a viewer never sees a full-access UI flash.

A **401 from any call** means the token died mid-session: `apiClient` clears it
and dispatches an event, `useAuth` catches it and drops back to the sign-in
screen with the reason shown.

## Role-based access control

The API names permissions `resource:action` and its controllers ask for
permissions, never for roles.

| | admin | category_manager | material_manager | viewer |
| --- | :-: | :-: | :-: | :-: |
| read everything | ✅ | ✅ | ✅ | ✅ |
| write categories + sub-categories | ✅ | ✅ | ❌ | ❌ |
| write materials | ✅ | ❌ | ✅ | ❌ |
| manage users | ✅ | ❌ | ❌ | ❌ |

### The UI does not gate on any of this

**Every button is shown and clickable to every role, and both pages are
reachable by everyone.** Enforcement is entirely the API's: a request the role
may not make comes back **403**, and that is surfaced as an amber notice naming
the missing permission — inside the form for a save, as a toast for a delete,
status flip or role change.

So a `viewer` can press **Add material** and fill the form in; it fails on
submit with *"Your role 'viewer' is not allowed to perform this action. Missing
permission: material:create."* A role without `user:read` can open **Users** and
gets the page's error panel instead of a list.

The trade is deliberate: nothing is hidden, and nothing about what a role may
do has to be kept in step between the two codebases — but a user only finds out
a button was not for them after pressing it.

### Re-enabling the gating

The toolkit is still in the tree, just not wired to anything:
`domain/auth/permissions.js`, `presentation/auth/AuthContext.jsx` (`can`,
`canAny`, `isReadOnly`, `reasonFor`) and `presentation/auth/Can.jsx`
(`<Can>`, `<GuardedButton>`). Swapping a `<button>` back to a
`<GuardedButton permission={...}>` is all it takes per control; see
[How to gate something](#how-to-gate-something) below.

## Users page

**Users** is in the sidebar for everyone, but only an admin's token can load
it — `user:read` is what `GET /users` requires, so any other role gets the
page's error panel.

Signed in as an admin, you can:

- **Add a user** — the full form: name, email, phone, password, role, status,
  departments, projects, "reporting to", plus a profile image and a digital
  signature. Sent as `multipart/form-data`.
- **Assign a role**, either in the form or straight from the table's role
  dropdown. It lands on that user's **next request** — permissions are resolved
  per request, not baked into their token, so they do not need to sign in again.
- **Deactivate** instead of deleting. The record survives; their login answers
  401 "This account is inactive".
- **Edit** — a full replace. A blank password leaves theirs unchanged; an empty
  multi-select clears it.

Assigning a role is the whole point: it is what decides whether that person can
add a category, add a material, or only look. Set someone to *material manager*
and the category tree turns read-only for them while the material actions come
alive — the Materials page reads the same permission list.

### Guards the page respects

The API refuses these with a **409**, and the UI blocks them first so the guard
is explained rather than hit: you cannot change your own role, deactivate or
delete your own account, or demote the last active admin.

### One API quirk worth knowing

`phone` is validated as exactly 10 digits **when present**, so an empty phone
has to be left out of the request rather than sent blank. That is why
`toUserPayload` omits it — sending `phone=""` fails with
`{ "errors": { "phone": "Phone number must be exactly 10 digits" } }`. Omitting
it on a PUT clears it, which is what an emptied field means anyway.

### How to gate something

```jsx
import { PERMISSIONS } from "../../domain/auth/permissions";
import { useSession } from "../auth/AuthContext";
import { Can, GuardedButton } from "../auth/Can";

// A button that disables itself and explains why on hover
<GuardedButton permission={PERMISSIONS.MATERIAL_CREATE} onClick={openAdd}>
  Add material
</GuardedButton>

// Conditional rendering — `any` switches to "at least one of these"
<Can permission={[PERMISSIONS.CATEGORY_UPDATE, PERMISSIONS.CATEGORY_DELETE]} any>
  <Toolbar />
</Can>

// Imperative checks
const { can, isReadOnly, roleLabel } = useSession();
```

`<GuardedButton>` shows a denied control greyed and inert with the reason on
hover, rather than removing it. It deliberately does **not** set the `disabled`
attribute — browsers swallow mouse events on disabled controls, so the tooltip
that justifies leaving the button there would never appear. Pass
`hideWhenDenied` where a row of dead icons would be noise.

### Where the role still shows up

Two places, both cosmetic or transport-level rather than gates:

- the **role badge** under the user's name in the sidebar, and the role
  catalogue on the sign-in screen;
- **401 handling** — a dead token still clears the session and returns to
  sign-in. That is authentication, not authorisation, and is unaffected.

| Path | Role |
| --- | --- |
| `domain/auth/permissions.js` | The permission vocabulary, role labels, and `can` / `canAny` |
| `presentation/auth/AuthContext.jsx` | `useSession()` — role label, and the unused `can` helpers |
| `presentation/auth/Can.jsx` | `<Can>` and `<GuardedButton>` — retained, currently unused |
| `presentation/utils/apiError.js` | Flattens `{ errors }`, `{ reason }` and 403 bodies into one sentence |
| `presentation/components/layout/AppShell.jsx` | The shared sidebar and its nav |
| `presentation/pages/users/UsersPage.jsx` | The user directory |
| `domain/entities/User.js` | `toUserPayload` / `toUserForm` — the form's two directions |
