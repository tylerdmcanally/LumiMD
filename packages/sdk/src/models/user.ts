/**
 * User Profile Model
 */

export interface UserProfile {
  id: string;
  email?: string;
  displayName?: string;
  allergies?: string[];
  tags?: string[];
  folders?: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
}

