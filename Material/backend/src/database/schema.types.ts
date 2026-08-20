import type { Generated, Kysely, Transaction } from 'kysely';
import type { Status } from '../common/types';

/**
 * The shape of every table, as Kysely sees it. This is the file that makes a
 * typo in a column name a compile error instead of a 500 at runtime — it has
 * to stay in step with schema.sql.
 *
 * Column names are camelCase here because the connection installs
 * CamelCasePlugin: Kysely writes `first_name` to PostgreSQL and hands back
 * `firstName`, so no repository needs a row-mapping function.
 *
 * `Generated<T>` marks a column the database fills in (a serial id, a
 * DEFAULT), so it is optional on insert but always present on select.
 */

/**
 * timestamptz comes back from pg as a Date. Every one of these has a DEFAULT,
 * and `updatedAt` is set with `now()` rather than the application clock, so
 * nothing ever writes one by hand.
 */
type Timestamp = Date;

export interface RolesTable {
  id: Generated<number>;
  name: string;
  slug: string;
  description: string | null;
  color: Generated<string>;
  isSystem: Generated<boolean>;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
}

export interface ModulesTable {
  id: Generated<number>;
  key: string;
  name: string;
  moduleGroup: Generated<string>;
  sortOrder: Generated<number>;
  createdAt: Generated<Timestamp>;
}

export interface RolePermissionsTable {
  roleId: number;
  moduleId: number;
  canRead: Generated<boolean>;
  canWrite: Generated<boolean>;
  canUpdate: Generated<boolean>;
  canDelete: Generated<boolean>;
}

export interface UsersTable {
  id: Generated<number>;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  /** Only ever selected by UsersRepository.findCredentials. */
  passwordHash: string;
  role: string;
  status: Generated<Status>;
  profileImage: string | null;
  signature: string | null;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
}

export interface DepartmentsTable {
  id: Generated<number>;
  name: string;
  code: string | null;
  parentId: number | null;
  status: Generated<Status>;
  createdAt: Generated<Timestamp>;
}

export interface ProjectsTable {
  id: Generated<number>;
  name: string;
  code: string | null;
  status: Generated<Status>;
  createdAt: Generated<Timestamp>;
}

export interface UserDepartmentsTable {
  userId: number;
  departmentId: number;
}

export interface UserProjectsTable {
  userId: number;
  projectId: number;
}

export interface UserManagersTable {
  userId: number;
  managerId: number;
}

export interface CategoriesTable {
  id: Generated<number>;
  code: string | null;
  name: string;
  description: string | null;
  status: Generated<Status>;
  createdAt: Generated<Timestamp>;
}

export interface SubcategoriesTable {
  id: Generated<number>;
  categoryId: number;
  parentId: number | null;
  code: string | null;
  name: string;
  description: string | null;
  status: Generated<Status>;
  createdAt: Generated<Timestamp>;
}

export interface MaterialsTable {
  id: Generated<number>;
  code: string;
  name: string;
  categoryId: number;
  subcategoryId: number | null;
  uom: string;
  hsn: Generated<string>;
  gst: Generated<string>;
  description: string | null;
  status: Generated<Status>;
  createdAt: Generated<Timestamp>;
}

export interface Database {
  roles: RolesTable;
  modules: ModulesTable;
  rolePermissions: RolePermissionsTable;
  users: UsersTable;
  departments: DepartmentsTable;
  projects: ProjectsTable;
  userDepartments: UserDepartmentsTable;
  userProjects: UserProjectsTable;
  userManagers: UserManagersTable;
  categories: CategoriesTable;
  subcategories: SubcategoriesTable;
  materials: MaterialsTable;
}

/** What repositories inject. */
export type Db = Kysely<Database>;

/** What a repository method takes when it has to join an outer transaction. */
export type DbOrTrx = Db | Transaction<Database>;
