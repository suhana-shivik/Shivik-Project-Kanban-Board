-- Applied on every boot. Every statement is idempotent, so it doubles as the
-- migration for an existing database: adding a column here is enough.

-- ---------------------------------------------------------------- RBAC ----
-- Roles are rows, not an enum in the code. "Create New Role" writes here, and
-- the guards read their permissions back out on the next request.
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  -- what a human types: "Site Engineer"
  name        TEXT NOT NULL,
  -- what the JWT carries and permissions key off: "site_engineer"
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  -- the swatch picked in "IDENTIFY WITH COLOR"
  color       TEXT NOT NULL DEFAULT '#6B7280',
  -- admin is protected: it cannot be deleted or stripped of user:* rights,
  -- or nobody could ever hand out permissions again
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS roles_name_key ON roles (lower(name));

-- Seeded here rather than in TypeScript because users.role points at
-- roles.slug — the foreign key below needs these rows to already exist.
INSERT INTO roles (name, slug, description, color, is_system) VALUES
  ('Admin', 'admin', 'Full access, including roles, users and departments', '#EF4444', true),
  ('Category Manager', 'category_manager', 'Creates and maintains categories and sub-categories', '#3B82F6', false),
  ('Material Manager', 'material_manager', 'Creates and maintains materials', '#F59E0B', false),
  ('Viewer', 'viewer', 'Read-only access to the master data', '#6B7280', false)
ON CONFLICT (slug) DO NOTHING;

-- One row per screen the permission grid can switch on. `key` is the first
-- half of a permission string, so `material` yields material:read/create/…
CREATE TABLE IF NOT EXISTS modules (
  id           SERIAL PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  -- the small grey label above the module name in the grid
  module_group TEXT NOT NULL DEFAULT 'GENERAL',
  sort_order   INTEGER NOT NULL DEFAULT 100,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only modules that have guarded routes behind them, so no toggle in the grid
-- is decorative.
INSERT INTO modules (key, name, module_group, sort_order) VALUES
  ('category',    'Categories',         'MATERIAL MASTER',          10),
  ('subcategory', 'Sub-categories',     'MATERIAL MASTER',          20),
  ('material',    'Materials',          'MATERIAL MASTER',          30),
  ('user',        'Users',              'TEAM AND COLLABORATION',   40),
  ('role',        'Roles & Permissions','TEAM AND COLLABORATION',   50),
  ('department',  'Departments',        'TEAM AND COLLABORATION',   60)
ON CONFLICT (key) DO NOTHING;

-- The grid itself: one row per role per module, four toggles wide. A module
-- with no row is simply not configured for that role — the trash icon deletes
-- the row rather than turning every toggle off.
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id    INTEGER NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  module_id  INTEGER NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
  can_read   BOOLEAN NOT NULL DEFAULT false,
  can_write  BOOLEAN NOT NULL DEFAULT false,
  can_update BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (role_id, module_id)
);

-- Admin: every toggle on every module.
INSERT INTO role_permissions (role_id, module_id, can_read, can_write, can_update, can_delete)
SELECT r.id, m.id, true, true, true, true
  FROM roles r CROSS JOIN modules m
 WHERE r.slug = 'admin'
ON CONFLICT DO NOTHING;

-- The other three read everything, and write only their own patch.
INSERT INTO role_permissions (role_id, module_id, can_read, can_write, can_update, can_delete)
SELECT r.id,
       m.id,
       true,
       owns.writes,
       owns.writes,
       owns.writes
  FROM roles r
  CROSS JOIN modules m
  CROSS JOIN LATERAL (
    SELECT (r.slug = 'category_manager' AND m.key IN ('category', 'subcategory'))
        OR (r.slug = 'material_manager' AND m.key = 'material') AS writes
  ) owns
 WHERE r.slug IN ('category_manager', 'material_manager', 'viewer')
   AND m.key IN ('category', 'subcategory', 'material', 'department')
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------- master data ----
CREATE TABLE IF NOT EXISTS departments (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT,
  status      TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS departments_name_key ON departments (lower(name));

-- "PARENT DEPARTMENT" on the Add New Department dialog. Nests with no depth
-- limit; RESTRICT so a parent cannot be deleted out from under its children.
ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_id INTEGER;
DO $$
BEGIN
  ALTER TABLE departments
    ADD CONSTRAINT departments_parent_fkey
    FOREIGN KEY (parent_id) REFERENCES departments (id) ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE departments
    ADD CONSTRAINT departments_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS departments_parent_idx ON departments (parent_id);

CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT,
  status      TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS projects_name_key ON projects (lower(name));

-- One row per person in the "Add New User" form.
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  -- relative paths under UPLOAD_DIR, not the bytes themselves
  profile_image  TEXT,
  signature      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- case-insensitive: Suhana@x.com and suhana@x.com are the same account
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

-- users.role holds the slug rather than an id, so the JWT and every read stay
-- readable. ON UPDATE CASCADE means renaming a role carries its users along.
-- Any row pointing at a role that no longer exists is parked on viewer first,
-- otherwise the constraint could not be added to an existing database.
UPDATE users SET role = 'viewer'
 WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.slug = users.role);
DO $$
BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_role_fkey
    FOREIGN KEY (role) REFERENCES roles (slug) ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- The three multi-selects. ON DELETE CASCADE so removing a user, department or
-- project cannot leave a dangling assignment behind.
CREATE TABLE IF NOT EXISTS user_departments (
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES departments (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, department_id)
);

CREATE TABLE IF NOT EXISTS user_projects (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);

-- "Reporting to". Self-referencing, and a user may report to more than one
-- manager, so it is its own table rather than a column on users.
CREATE TABLE IF NOT EXISTS user_managers (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  manager_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, manager_id),
  -- nobody reports to themselves
  CHECK (user_id <> manager_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  code        TEXT,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_key ON categories (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS categories_code_key ON categories (lower(code)) WHERE code IS NOT NULL;

-- Nests inside itself with no depth limit: parent_id NULL means it sits
-- directly under its category.
CREATE TABLE IF NOT EXISTS subcategories (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  parent_id   INTEGER REFERENCES subcategories (id) ON DELETE RESTRICT,
  code        TEXT,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE UNIQUE INDEX IF NOT EXISTS subcategories_code_key ON subcategories (lower(code)) WHERE code IS NOT NULL;
-- a name only has to be unique among its own siblings; the two partial indexes
-- are needed because NULL parent_id never equals itself in a plain unique index
CREATE UNIQUE INDEX IF NOT EXISTS subcategories_root_name_key
  ON subcategories (category_id, lower(name)) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS subcategories_child_name_key
  ON subcategories (parent_id, lower(name)) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subcategories_category_idx ON subcategories (category_id);
CREATE INDEX IF NOT EXISTS subcategories_parent_idx ON subcategories (parent_id);

CREATE TABLE IF NOT EXISTS materials (
  id             SERIAL PRIMARY KEY,
  code           TEXT NOT NULL,
  name           TEXT NOT NULL,
  category_id    INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  subcategory_id INTEGER REFERENCES subcategories (id) ON DELETE RESTRICT,
  uom            TEXT NOT NULL,
  hsn            TEXT NOT NULL DEFAULT '-',
  gst            TEXT NOT NULL DEFAULT '-',
  description    TEXT,
  status         TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS materials_code_key ON materials (lower(code));
CREATE INDEX IF NOT EXISTS materials_category_idx ON materials (category_id);
CREATE INDEX IF NOT EXISTS materials_subcategory_idx ON materials (subcategory_id);

-- ------------------------------------------------------ consumption log ----
-- One row per quantity drawn against a material. The monthly consumption
-- report aggregates these by material and category; CASCADE because a draw
-- against a material that no longer exists has nothing left to report on.
CREATE TABLE IF NOT EXISTS material_consumptions (
  id          SERIAL PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
  -- three decimals covers every unit the UOM list offers (kg, m³, litres...)
  quantity    NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  -- the calendar date the report buckets on, independent of created_at
  consumed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS material_consumptions_material_idx ON material_consumptions (material_id);
CREATE INDEX IF NOT EXISTS material_consumptions_consumed_on_idx ON material_consumptions (consumed_on);
