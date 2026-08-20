<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

Material master backend: **NestJS + PostgreSQL**, JWT authentication and
role-based access control. Categories, sub-categories and materials are
separate resources; who may touch which is decided by the caller's role.

## How the code is laid out

```
src/
  common/        types, domain errors, transforms, pagination, the exception filter
  database/      pg pool, Kysely, schema.sql + the boot-time migration
  redis/         client, RedisService, the key registry
  auth/          controllers → services → repositories, guards, RBAC, caches
  material/      controllers → services → repositories
  uploads/       multer storage + the URL helper
  health/        liveness and readiness probes
```

Four rules hold everywhere:

1. **All database access lives in a `*.repository.ts`**, written with
   [Kysely](https://kysely.dev). Services never build a query, so swapping a
   table or adding an index touches one file.
2. **Services never throw HTTP.** They raise `NotFoundError`, `ConflictError`
   and `ValidationError` from [errors.ts](src/common/errors.ts); a single
   [DomainExceptionFilter](src/common/domain-exception.filter.ts) turns those
   into 404 / 409 / 400 at the edge. The business layer does not know it is
   being reached over HTTP.
3. **Redis is a cache, never a source of truth.** Anything it holds can be
   thrown away without losing a fact, which is why the app keeps working when
   it is down.
4. **Nothing shared lives inside a feature.** `Status`, `Lookup` and the
   transforms sit in `common/`, so `auth` and `material` do not import from
   each other.

That filter also catches anything unexpected and returns a bare 500 with the
detail written to the log — a leaked `syntax error at or near "grant"` tells an
attacker about the schema.

This is layered architecture with a clean dependency direction, not Onion:
services depend on concrete repositories rather than on interfaces they own.
For a CRUD service on a database that is not going to change, that trade is
deliberate.

## Running it in production

| Setting | Why it matters |
| --- | --- |
| `AUTH_SECRET` | **The app refuses to start** with `NODE_ENV=production` if this is missing, under 32 characters, or the bundled dev value. Every token is signed with it. |
| `CORS_ORIGINS` | Comma-separated allow-list. Unset means any origin may call the API — logged as a warning in production. |
| `BODY_LIMIT` | Caps JSON/form bodies (default `1mb`). Files are capped separately by `UPLOAD_MAX_BYTES`. |
| `NODE_ENV` | `production` turns the secret warning into a hard failure. |

Copy [.env.example](.env.example) to `src/.env` to start. Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Health probes** — two, because they answer different questions:

- `GET /api/health/live` — is the process up? Never touches the database, so a
  database blip cannot make an orchestrator kill a healthy app.
- `GET /api/health` — can it serve traffic? Pings PostgreSQL and answers **503**
  when it cannot, so a load balancer stops routing to it.

Shutdown hooks are enabled, so the pg pool drains on SIGTERM instead of being
killed mid-query during a deploy. The boot-time schema apply takes a PostgreSQL
advisory lock, so several instances starting at once cannot race each other.

## Pagination

Opt-in, so nothing that already calls these endpoints breaks. Send neither
`page` nor `limit` and a list comes back as a plain array. Send either and it
comes back wrapped:

```jsonc
// GET /api/departments?page=1&limit=3
{ "data": [ … ], "total": 5, "page": 1, "limit": 3, "pages": 2 }
```

Available on categories, sub-categories, materials, users and departments.
`limit` is capped at 200.

## Database

Storage is your local PostgreSQL. Point `src/.env` at it:

```
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=…
DB_NAME=material_master
DB_POOL_MAX=100
```

Nothing has to be set up by hand. On the first `npm run start`:

1. The database named in `DB_NAME` is created if it does not exist — the
   `CREATE DATABASE` runs over a throwaway connection to `postgres`, since it
   cannot run from inside the database it creates.
2. [schema.sql](src/database/schema.sql) is applied. Every statement is
   `IF NOT EXISTS`, so it re-runs safely on every boot and doubles as the
   migration path — adding a column there is enough.
3. The five departments, three projects and four demo accounts are seeded.
4. If a `data/db.json` from the older JSON-file version is present and the
   tables are still empty, its categories, sub-categories and materials are
   imported with their original ids, and the sequences are fast-forwarded past
   them.

Tables: `roles`, `modules`, `role_permissions`, `users`, `departments`,
`projects`, `user_departments`, `user_projects`, `user_managers`, `categories`,
`subcategories`, `materials`. The three `user_*` tables are the multi-selects on
the user form; `role_permissions` is the permission grid.

### Kysely

Queries are built with [Kysely](https://kysely.dev) over the `pg` pool. It is a
typed query builder rather than an ORM: no entity classes, no lazy loading, no
hidden N+1 — the SQL it emits is the SQL you wrote.

[schema.types.ts](src/database/schema.types.ts) describes every table, and it is
what makes a mistyped column a **compile error instead of a 500**. `Generated<T>`
marks the columns the database fills in, so they are optional on insert and
always present on select.

The connection installs `CamelCasePlugin`: `first_name` in PostgreSQL is
`firstName` in TypeScript, both ways. That removed every hand-written row-mapper
the repositories used to need. The one thing to watch — **it does not reach
inside `` sql`...` `` fragments**, so raw snippets must spell columns the way the
database has them. Those fragments are marked with a comment where they appear.

Set `DB_LOG_QUERIES=true` to log every statement with its duration; failed
queries are always logged with the SQL that broke.

Both trees — sub-categories and departments — are walked by recursive CTEs built
through `withRecursive`, so `depth` and `path` come back computed by the
database rather than assembled in JavaScript. A user and its departments,
projects, managers and permissions arrive in **one** round trip via
`jsonArrayFrom`.

Transactions go through `DbService.tx()`, which wraps
`db.transaction().execute()` and rolls back on a throw.

## RBAC

### The four seeded accounts

All of them use the password `123456`.

| Email | Role | What this account is for |
| --- | --- | --- |
| `suhana@gmail.com` | `admin` | Everything, plus the user directory |
| `category@gmail.com` | `category_manager` | **Adds categories and sub-categories** |
| `material@gmail.com` | `material_manager` | **Adds materials** |
| `viewer@gmail.com` | `viewer` | Read-only |

Those four are **rows in the `roles` table**, not values in an enum. They are
the starting point, not the whole list — add your own through the Roles &
Permissions API and it works everywhere a role is accepted.

### Who may do what, out of the box

| | admin | category_manager | material_manager | viewer |
| --- | :-: | :-: | :-: | :-: |
| Read categories / sub-categories / materials | ✅ | ✅ | ✅ | ✅ |
| Create / update / delete categories | ✅ | ✅ | ❌ | ❌ |
| Create / update / delete sub-categories | ✅ | ✅ | ❌ | ❌ |
| Create / update / delete materials | ✅ | ❌ | ✅ | ❌ |
| Manage users, roles and departments | ✅ | ❌ | ❌ | ❌ |

`category_manager` and `material_manager` can *read* each other's resources —
a material has to be filed under a category, so its owner needs to see the
tree — but neither can write the other's. All of this is stored data, so it is
editable at runtime rather than being a property of the code.

### How it is wired

Permissions are named `module:action` and stored in `role_permissions` — one
row per role per module, four toggles wide. Controllers ask for permissions,
never for roles, so re-cutting a role happens on the Roles & Permissions
screen and no controller moves:

```ts
@Post()
@RequirePermissions('material:create')
create(@Body() body: Record<string, unknown>) { ... }
```

Two guards are registered as `APP_GUARD` in [auth.module.ts](src/auth/auth.module.ts),
so they cover every controller in the app:

1. [AuthGuard](src/auth/auth.guard.ts) — verifies the bearer token, reads the
   account's *current* role and status from the database, and hangs the user
   on the request. A route is protected **by default**; it opts out with
   `@Public()`.
2. [PermissionsGuard](src/auth/permissions.guard.ts) — compares the role's
   permission list against what the route asked for.

Nothing about authorisation is trusted from the token beyond the user id. The
role, the account status and the permission grid are all read per request, so
three things bite immediately rather than at the next login:

- flipping a toggle on a role — every holder of that role is affected on their
  next call;
- moving a user to a different role;
- deactivating or deleting an account, which turns its live token into a 401.

The role→permission map is cached in memory by
[RolePermissionsCache](src/auth/role-permissions.cache.ts) and invalidated by
every write on the Roles screen, so this costs one indexed user lookup per
request rather than a join.

Public routes: `POST /auth/register`, `POST /auth/login`, `GET /auth/roles`,
`GET /users/lookups`, `GET /api` (health) and the `/api/metrics` dashboard —
the dashboard is opened straight in a browser tab and polls with plain
`fetch`, so there is nowhere to attach a token.

### Logging in

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"category@gmail.com","password":"123456"}'
```

```jsonc
{
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 28800,
  "expiresAt": "2026-08-14T02:11:09.000Z",
  "user": {
    "id": 2,
    "firstName": "Priya",
    "lastName": "Sharma",
    "name": "Priya Sharma",
    "email": "category@gmail.com",
    "phone": null,
    "role": "category_manager",
    "status": "Active",
    "profileImageUrl": null,
    "signatureUrl": null,
    "departments": [],
    "projects": [],
    "reportingTo": [],
    "permissions": ["category:read", "subcategory:read", "material:read", "..."]
  }
}
```

Send it on every other call:

```bash
curl http://localhost:3000/api/categories -H "Authorization: Bearer $TOKEN"
```

`user.permissions` is there so a frontend can decide which buttons to render
without hard-coding the role names.

### What a refusal looks like

No token, or an expired/tampered one — **401**:

```json
{ "statusCode": 401, "message": "Missing bearer token. Call POST /api/auth/login first." }
```

Signed in, but the role does not cover the action — **403**, naming what was
missing:

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Your role 'category_manager' is not allowed to perform this action",
  "requiredPermissions": "material:create",
  "role": "category_manager"
}
```

## Redis

Redis is a **cache and a rate limiter, never a source of truth**. PostgreSQL
holds every fact; Redis only holds copies with a TTL. That one rule is what
lets the next section be true.

```bash
docker run -d --name material-redis --restart unless-stopped -p 6379:6379 redis:7-alpine
```

Configure it in `src/.env` (`REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`,
`REDIS_PREFIX`). Every key is written under `REDIS_PREFIX`, so this app can
share a Redis with others without collisions. `REDIS_ENABLED=false` turns it
off entirely.

### The app runs fine without it

Every read returns `null` and every write returns `false` when Redis is
unreachable, so callers fall through to PostgreSQL —
[redis.service.ts](src/redis/redis.service.ts) enforces this. Losing the cache
costs latency, not availability.

This is verified, not assumed: the full 216-check suite passes with the Redis
container **stopped**, and the app reconnects on its own when it comes back —
no restart needed. The readiness probe then reports `status: "degraded"` with
`cache.status: "down"` but still answers **200**, because the API can serve
every request. Only PostgreSQL being down makes it 503.

### What is cached

| Key | Holds | TTL | Dropped when |
| --- | --- | --- | --- |
| `perm:roles` | every role's permission strings | 300s | any write on the Roles screen |
| `auth:user:<id>` | the signed-in account's role + status | 30s | that user's role, status or profile changes |
| `lookup:form` | the departments + projects dropdowns | 120s | a department changes |
| `lookup:modules` | the module catalogue | 300s | - (seeded data) |
| `ratelimit:login:<email>` | failed sign-in count | 900s | a correct password |
| `list:materials:<filters>` | the materials list, per filter combination | 60s | any material write (pattern delete) |

Keys are built in [cache.keys.ts](src/redis/cache.keys.ts) rather than inline,
so a typo cannot silently cache nothing.

`auth:user:<id>` is the one that matters most: the guard reads the account's
*current* role and status on every request, which used to be a PostgreSQL
lookup per call. The TTL is deliberately short - every write that could change
the answer invalidates the key explicitly, so the TTL is only a safety net for
a missed invalidation, not the mechanism.

### Two layers, and why

The permission map is cached **in-process as well as in Redis**. The guard
reads it on every request, so it must not cost a network hop. Redis is the
second layer, and its real job is the fan-out: a write publishes to
`cache:invalidate`, and every other instance drops its local copy. Without
that, a second instance would keep serving stale permissions until its TTL ran
out - which would quietly break the "flip a toggle, it applies on the next
request" promise as soon as you run more than one process.

### Transactions and ordering

Two places need atomicity, and they need different tools:

**`MULTI`/`EXEC`** for the invalidation - the `DEL` and the `PUBLISH` go in one
round trip, so no instance can be told to invalidate a key that is still
present.

**A Lua script** for the login counter, because `INCR` then `EXPIRE` is not
safe as two commands:

```lua
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return { n, redis.call('TTL', KEYS[1]) }
```

If the process died between the two, the key would never expire and that email
would be **locked out permanently** - a self-inflicted denial of service. Lua
runs it as one atomic unit.

The third ordering rule has nothing to do with Redis commands: **invalidate
only after the PostgreSQL transaction commits.** Every `accounts.invalidate()`
call sits after its repository write, never inside `db.tx()`. Clearing the
cache from inside the transaction would let a concurrent read repopulate it
from a row that is about to be rolled back.

### Thundering herd

A cached key expires or is invalidated. Every request that arrives before the
first one finishes *also* sees a miss, so they all run the same query. 96
readers become 96 identical `SELECT`s - and it bites hardest exactly when
traffic is highest.

`remember()` fixes this with **single-flight**: the first miss runs the loader,
every other request waits on that same promise.

Measured on this app, 96 concurrent reads with 3 writes spread through them:

| | DB queries | Duration | Avg load |
| --- | --: | --: | --: |
| Without coalescing | **96** | 979ms | 688ms |
| With coalescing | **1** | 70ms | 58ms |

96x fewer queries, 14x faster. The average load time collapses too, because
the queries were competing with each other for pool connections.

Reproduce it yourself - the **Thundering herd (cache demo)** folder in Postman,
or:

```bash
curl -X POST http://localhost:3000/api/diagnostics/thundering-herd   -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json'   -d '{"reads":96,"writes":3,"singleFlight":false}'   # the problem
  #  "singleFlight":true                              # the fix
```

The burst has to be fired **server-side**, which is why this is an endpoint and
not a Postman Runner loop: Postman runs requests sequentially, so request 2
never leaves until request 1 returns, the misses never overlap, and no herd
ever forms.

The **Cache** card on `/api/metrics/dashboard` shows it live: "DB loads" spikes
on the first run, "Queries avoided" takes over on the second.

Two honest limits:

- Coalescing is **per process**. Four instances still run four queries rather
  than one - a big win, not a total one. Closing that gap needs a distributed
  lock, which costs a round trip on every miss.
- Coalescing is **per process**, so this is the one limit that remains: four
  instances still run four queries rather than one.

### A write landing mid-read

The dangerous interleaving is not "write then read" or "read then write" — both
of those are fine. It is this one:

```
1. reader misses, starts SELECT           sees the old rows
2. writer commits, invalidates the key    cache is now empty — correct
3. reader's SELECT resolves               still holding the old rows
4. reader writes that result into Redis   cache is now WRONG
```

Step 4 undoes step 2, and the stale rows are then served to *everyone* until
the TTL expires.

`remember()` stamps every load with a generation number taken before it starts
and re-checks it before writing back. If a write bumped that generation
in the meantime, the result is handed to the callers already waiting — they
asked before the write, so those rows are a legitimate answer for them — but it
is **not** put in the cache, where the next caller would get it too.

Pattern invalidation bumps a coarser epoch counter as well, because a `SCAN`
finds nothing while the cache is still cold, which is exactly the moment an
in-flight load is about to write stale rows back.

The `discarded` counter on `GET /api/diagnostics/cache` counts loads thrown
away this way. Seeing a few under write-heavy load is correct behaviour, not a
problem.

Covered by [stale-write.spec.ts](src/redis/stale-write.spec.ts), which drives
the interleaving deliberately rather than hoping to hit it.

### Login rate limiting

`POST /auth/login` allows `LOGIN_MAX_ATTEMPTS` failures (default 10) per
`LOGIN_WINDOW_SECONDS` (default 900) per email, then answers **429** with
`retryAfterSeconds`. The check runs *before* the password is verified, so a
locked-out attacker cannot keep burning scrypt hashes on the process. A correct
password clears the counter, so a genuine typo streak is not punished.

With Redis down there is no limiting rather than no logins - the limiter is a
mitigation, not the only thing protecting an account.

## Roles & Permissions

Roles are created at runtime. Creating one immediately makes its slug a role a
user can be given — no deploy, no code change.

```bash
curl -X POST http://localhost:3000/api/roles \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Site Engineer","color":"#00C875"}'
```

The slug the JWT carries is derived from the name: `Site Engineer` →
`site_engineer`. **A new role holds nothing** until its grid is submitted.

### The permission grid

One row per module, four toggles wide. Each toggle that is on becomes a
permission string:

| Column | Permission | Guards |
| --- | --- | --- |
| READ | `material:read` | `GET /materials` |
| WRITE | `material:create` | `POST /materials` |
| UPDATE | `material:update` | `PUT`, `PATCH` |
| DELETE | `material:delete` | `DELETE /materials/:id` |

```bash
curl -X PUT http://localhost:3000/api/roles/5/permissions \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"permissions":[
        {"moduleId":3,"read":true,"write":true,"update":true,"delete":false},
        {"moduleId":1,"read":true,"write":false,"update":false,"delete":false}
      ]}'
```

That is SUBMIT PERMISSIONS: **the posted list becomes the whole grid**, so a
module left out is removed from the role. `POST .../permissions` adds or
updates one row (ADD PERMISSION), and `DELETE .../permissions/:moduleId` is the
trash icon — un-configuring a module rather than switching its toggles off.

The response carries both shapes: `permissions` is the grid as the UI renders
it, and `grants` is the flattened permission strings the guards compare —
useful when working out why something 403s.

Six modules are seeded: Categories, Sub-categories, Materials, Users,
Roles & Permissions, Departments. Only modules with real guarded routes are
listed, so no toggle in the grid is decorative.

### Routes

| Method | Route | Needs |
| --- | --- | --- |
| `GET` | `/api/roles/colors` | — (public) the eleven swatches |
| `GET` | `/api/roles` | `role:read` |
| `GET` | `/api/roles/modules` | `role:read` |
| `GET` | `/api/roles/:id` | `role:read` — role + grid |
| `POST` | `/api/roles` | `role:create` |
| `PUT` | `/api/roles/:id` | `role:update` |
| `PUT` | `/api/roles/:id/permissions` | `role:update` — submit the grid |
| `POST` | `/api/roles/:id/permissions` | `role:update` — add one row |
| `DELETE` | `/api/roles/:id/permissions/:moduleId` | `role:update` — remove a row |
| `DELETE` | `/api/roles/:id` | `role:delete` |

### What is protected

The built-in `admin` role is flagged `is_system`. It cannot be deleted, its
slug is fixed even if you rename its label, and it cannot be stripped of read
and update on Users or Roles — any of those would leave nobody able to hand
permissions out again, with no way back through the API.

Deleting a role is refused while users still hold it (the message counts them),
and renaming one carries its users along through an `ON UPDATE CASCADE` foreign
key, so nobody is orphaned.

## Departments

Departments nest through `parentId` with no depth limit, the same way
sub-categories do. PARENT DEPARTMENT on the form is `parentId`; `None` means
send nothing.

```bash
curl -X POST http://localhost:3000/api/departments \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Structural","parentId":6}'
```

```jsonc
{
  "id": 7,
  "name": "Structural",
  "code": null,
  "status": "Active",
  "parentId": 6,
  "parentName": "Civil",   // the PARENT DEPARTMENT column; null renders as "-"
  "depth": 2,
  "path": ["Civil", "Structural"],
  "userCount": 0,
  "childCount": 0
}
```

`depth` and `path` come out of a recursive CTE, and the list is ordered by path
so children always sit under their parent. `userCount` and `childCount` are
there so the table can warn before a delete without extra calls.

| Method | Route | Needs |
| --- | --- | --- |
| `GET` | `/api/departments` | `department:read` — `?query=`, `?status=`, `?parentId=` |
| `GET` | `/api/departments/:id` | `department:read` |
| `GET` | `/api/departments/:id/children` | `department:read` |
| `POST` | `/api/departments` | `department:create` |
| `PUT` | `/api/departments/:id` | `department:update` |
| `DELETE` | `/api/departments/:id` | `department:delete` |

Refused with **400**: a duplicate name, an unknown parent, making a department
its own parent, or moving one under its own descendant. Refused with **409**: a
delete while sub-departments or assigned users still hang off it.

## Register (the "Add New User" form)

`POST /api/auth/register` takes the whole form as **`multipart/form-data`** —
that is what carries the profile image and the digital signature alongside the
text fields.

| Field | Required | Notes |
| --- | :-: | --- |
| `firstName` | ✅ | max 60 characters |
| `lastName` | ✅ | max 60 characters |
| `email` | ✅ | unique, case-insensitive |
| `password` | ✅ | at least 6 characters |
| `phone` | | exactly 10 digits if given |
| `role` | | a slug from `GET /api/auth/roles`; defaults to `viewer`, built-in roles refused here |
| `status` | | `Active` (default) or `Inactive` |
| `departmentIds` | | ids from `GET /api/users/lookups` |
| `projectIds` | | ids from `GET /api/users/lookups` |
| `managerIds` | | "reporting to" — ids from `GET /api/users/managers` |
| `profileImage` | | image file, max 2 MB |
| `signature` | | image file, max 2 MB |

The three id lists accept whichever shape your client sends: `1,2,3`,
`[1,2,3]`, or a repeated `departmentIds` key — see `ToIntArray` in
[transforms.ts](src/material/dto/transforms.ts).

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -F "firstName=Neha" \
  -F "lastName=Kulkarni" \
  -F "email=neha.kulkarni@gmail.com" \
  -F "password=neha123" \
  -F "phone=9876543210" \
  -F "role=material_manager" \
  -F "departmentIds=1,2" \
  -F "projectIds=1" \
  -F "managerIds=1" \
  -F "profileImage=@./avatar.png" \
  -F "signature=@./signature.png"
```

The response carries the account with everything resolved — the linked rows,
not just their ids:

```jsonc
{
  "message": "Registration successful",
  "user": {
    "id": 5,
    "firstName": "Neha",
    "lastName": "Kulkarni",
    "name": "Neha Kulkarni",
    "email": "neha.kulkarni@gmail.com",
    "phone": "9876543210",
    "role": "material_manager",
    "status": "Active",
    "profileImageUrl": "/uploads/profile-images/3adf83….png",
    "signatureUrl": "/uploads/signatures/9b1c22….png",
    "departments": [{ "id": 1, "name": "Accounts", "code": null, "status": "Active" }],
    "projects":    [{ "id": 1, "name": "Metro Depot Phase 1", "code": "PRJ-001", "status": "Active" }],
    "reportingTo": [{ "id": 1, "name": "Suhana Admin", "email": "suhana@gmail.com", "role": "admin" }],
    "permissions": ["category:read", "material:create", "..."]
  }
}
```

### Two doors, on purpose

| | `POST /api/auth/register` | `POST /api/users` |
| --- | --- | --- |
| Who | anyone (public) | `admin` only |
| Role | defaults to `viewer`, **`admin` refused** | any role, `admin` included |
| Body | identical | identical |

Public sign-up cannot hand itself the admin role — otherwise anyone could POST
their way to full access. If you want registration to be invite-only, drop the
`@Public()` on `register` in
[auth.controller.ts](src/auth/auth.controller.ts) and use `POST /users`.

### Uploads

Files land under `UPLOAD_DIR` (default `uploads/`) in `profile-images/` and
`signatures/`, named from 16 random bytes so two people uploading
`signature.png` cannot collide — or escape the folder with a crafted filename.
Only images are accepted, up to `UPLOAD_MAX_BYTES` (default 2 MB).

They are served straight from disk at `/uploads/…`, which sits **outside** the
`/api` prefix:

```
http://localhost:3000/uploads/profile-images/3adf83….png
```

On `PUT /api/users/:id`, sending no new file keeps the stored one — editing a
user does not force a re-upload. Sending an empty `projectIds` **does** clear
the assignments, because that is how a form says "nothing selected".

### Auth and user routes

| Method | Route | Needs |
| --- | --- | --- |
| `POST` | `/api/auth/login` | — (public) |
| `POST` | `/api/auth/register` | — (public) the sign-up form |
| `GET` | `/api/auth/roles` | — (public) role catalogue for a login screen |
| `GET` | `/api/auth/me` | any signed-in role |
| `GET` | `/api/auth/permissions` | any signed-in role |
| `POST` | `/api/auth/change-password` | any signed-in role |
| `GET` | `/api/users/lookups` | — (public) departments + projects for the form |
| `GET` | `/api/users/managers` | `user:read` (admin) — "reporting to" options |
| `GET` | `/api/users` | `user:read` (admin) |
| `GET` | `/api/users/:id` | `user:read` (admin) |
| `POST` | `/api/users` | `user:create` (admin) |
| `PUT` | `/api/users/:id` | `user:update` (admin) |
| `PATCH` | `/api/users/:id/role` | `user:update` (admin) |
| `PATCH` | `/api/users/:id/status` | `user:update` (admin) |
| `DELETE` | `/api/users/:id` | `user:delete` (admin) |

Deactivating a user (`status: "Inactive"`) keeps the record but blocks login.
Three changes are refused with **409** because they cannot be undone from
inside the app: demoting or deactivating the last active admin, changing your
own role, and deleting your own account.

### Passwords and tokens

Passwords are hashed with scrypt (`scrypt$salt$key`) using node's built-in
`crypto`, so no extra dependency is needed. The hash lives in
`users.password_hash`, and that column is read in exactly one place —
`findCredentials` in [users.repository.ts](src/auth/users.repository.ts). Every
other query selects around it, so no route can leak it by accident.

Tokens are standard HS256 JWTs, also signed with node's `crypto`. Configure
them in `src/.env`:

```
AUTH_SECRET=material-master-dev-secret-change-me
AUTH_TOKEN_TTL_SECONDS=28800
```

**Change `AUTH_SECRET` before this runs anywhere real** — every token is signed
with it.

### Trying it out

`postman/material-master.postman_collection.json` has a folder per role.
Run one of the four logins in **Auth (start here)** — it stores the token in
`{{token}}` and the whole collection sends it automatically. Each resource
folder also ends with a `(403)` request that pins a specific role's token, so
the denials are visible without signing out and back in.

The **Register (new user)** folder walks the whole sign-up: fetch the dropdown
lookups, register with files attached, log in as the new account, then eight
requests showing every way the form can be rejected.

## Tests

```bash
npm test            # unit — no PostgreSQL, no Redis, no server needed
npm run test:herd   # just the thundering-herd + cache tests, verbose
npm run test:e2e    # end to end, against a running API
npm run test:all    # both
```

### Unit — 36 tests, zero infrastructure

The interesting ones live in
[redis.service.spec.ts](src/redis/redis.service.spec.ts). They fire the 100
concurrent requests for you, so the herd can be proved without Postman, a load
tool, or anything running:

```
✓ collapses 100 simultaneous misses into a single load
✓ without single-flight, every one of the 100 hits the database
✓ serves the 96 reads and 3 writes scenario with one query
✓ does not leave a failed load stuck in the in-flight map
✓ falls through to the loader when Redis is down, without throwing
✓ deletes and publishes in one MULTI, so no instance sees a half state
```

They run against [fake-redis.ts](src/redis/fake-redis.ts), an in-memory stand-in
that mimics the handful of commands the app issues — including `keyPrefix`
behaviour, so the prefix-stripping in `invalidatePattern` is genuinely covered.
The coalescing is a property of the code, not of the server, so it should be
provable without one.

### Seeing a failure on purpose

A suite that only ever passes proves nothing. To watch these tests catch the
regression they exist for, flip one line in `src/.env`:

```
CACHE_SINGLEFLIGHT=false
```

Restart the API and run `npm run test:e2e`. Three tests fail, and the reports
above them show why:

```
100 concurrent GET /materials
  HTTP statuses        {"200":98,"500":2}     <- two requests actually failed
  DB queries (loads)   98                      <- one per reader
  coalesced (saved)    0

● serves 100 concurrent reads from a single query
    Expected: 1
    Received: 98
```

The `500`s are PostgreSQL refusing connections — `sorry, too many clients
already`. Ninety-eight simultaneous queries exceed what the server will accept,
so the herd does not just make things slow, it makes requests fail.

Set it back to `true` and they pass again.

On PowerShell an inline `CACHE_SINGLEFLIGHT=false npm run start` does **not**
work — that is bash syntax. Either edit `src/.env` as above, or:

```powershell
$env:CACHE_SINGLEFLIGHT="false"
npm run start
```

### E2E — 17 tests, against a running API

```bash
docker start material-redis
npm run start        # in one terminal
npm run test:e2e     # in another
```

These drive **a running server over HTTP** rather than booting the app inside
Jest. That tests the process that actually ships — global pipes, filters and
guards included — and sidesteps the fact that Kysely is ESM-only, which Jest's
CommonJS runtime cannot import.

If nothing is listening they **skip with a message** instead of failing:

```
e2e: nothing answering at http://localhost:3000 — those suites will be skipped.
Start the API first:  npm run start
```

Point them elsewhere with `E2E_BASE_URL=http://localhost:3111 npm run test:e2e`.

Two details worth knowing if you add to them:

- The reachability check runs in `globalSetup`, not `beforeAll`. `it` vs
  `it.skip` is decided while the describe body executes, which is *before* any
  hook runs — a flag set in `beforeAll` is always too late.
- `maxWorkers: 1`, because every suite shares one server and one set of cache
  counters. In parallel they reset each other's numbers mid-assertion.

## Project setup

```bash
$ npm install
```

Then make sure PostgreSQL is running and `src/.env` points at it. The database
itself does not need to exist — it is created on first boot.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
