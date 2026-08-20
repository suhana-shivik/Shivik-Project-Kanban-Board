import type { Lookup, Status, UserSummary } from '../common/types';
import type { Permission, Role } from './roles';

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: Role;
  status: Status;
  /** Path under UPLOAD_DIR, or null when nothing was uploaded. */
  profileImage: string | null;
  signature: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A user as it leaves the API. There is no variant that carries the password
 * hash — that column is only ever read by UsersRepository.findCredentials.
 */
export interface UserView extends User {
  /** firstName + lastName, so clients that want one label do not join it. */
  name: string;
  /** The role's display name and swatch, for rendering a chip. */
  roleName: string | null;
  roleColor: string | null;
  /** URL the profile image is served from, or null. */
  profileImageUrl: string | null;
  signatureUrl: string | null;
  departments: Lookup[];
  projects: Lookup[];
  reportingTo: UserSummary[];
  permissions: readonly Permission[];
}
