export type DocumentType =
  | "will"
  | "power_of_attorney"
  | "living_will"
  | "trust"
  | "deed"
  | "life_insurance"
  | "beneficiary_form"
  | "other";

export type LocationType =
  | "home_safe"
  | "bank_safety_deposit"
  | "attorney_office"
  | "gun_sitters_vault"
  | "other";

/**
 * Roles a user can hold on a particular vault.
 *  - owner     — the paying subscriber. Full control.
 *  - steward   — pre-event helper. May read & download. Cannot modify.
 *  - successor — sealed until the vault is released. Then read & download.
 */
export type VaultRole = "owner" | "steward" | "successor";

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
}

export interface VaultMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: VaultRole;
  documentIds: string[];
}

export interface Document {
  id: string;
  type: DocumentType;
  name: string;
  fileName?: string;
  hasFile: boolean;
  locationType: LocationType;
  address: string;
  description: string;
  memberIds: string[];
  lastUpdated: string | Date;
  createdAt: string | Date;
}

export interface Vault {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  releasedAt?: string | null;
  documents: Document[];
  members: VaultMember[];
  createdAt: string | Date;
}

/**
 * The trimmed view returned by /api/me/vaults — used in the vault switcher.
 */
export interface VaultSummary {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  role: VaultRole;
  releasedAt?: string | null;
  createdAt: string | Date;
}

export interface Notification {
  id: string;
  type:
    | "document_added"
    | "document_updated"
    | "member_added"
    | "viewer_added";
  message: string;
  timestamp: string | Date;
  read: boolean;
  vaultId?: string | null;
}
