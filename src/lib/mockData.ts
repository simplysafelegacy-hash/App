import type {
  Notification,
  User,
  Vault,
  VaultMember,
  VaultSummary,
} from "./types";

export const mockOwner: User = {
  id: "user-jane",
  name: "Jane Mitchell",
  email: "jane.mitchell@email.com",
  phone: "(555) 123-4567",
  subscriptionStatus: "active",
  subscriptionPlan: "family",
  currentPeriodEnd: "2027-03-01T00:00:00Z",
};

const janeOwnVaultId = "vault-jane";
const fathersVaultId = "vault-robert";
const sealedVaultId = "vault-elena";

const janeOwnerMember: VaultMember = {
  id: "member-jane-owner",
  userId: "user-jane",
  name: "Jane Mitchell",
  email: "jane.mitchell@email.com",
  role: "owner",
};

const stewardSon: VaultMember = {
  id: "member-michael-steward",
  userId: "user-michael",
  name: "Michael Mitchell",
  email: "michael.mitchell@email.com",
  role: "steward",
};

const successorDaughter: VaultMember = {
  id: "member-anna-successor",
  userId: "",
  name: "Anna Mitchell",
  email: "anna.mitchell@email.com",
  role: "successor",
};

export const mockVault: Vault = {
  id: janeOwnVaultId,
  name: "Jane Mitchell's vault",
  ownerId: "user-jane",
  ownerName: "Jane Mitchell",
  ownerEmail: "jane.mitchell@email.com",
  ownerPhone: "(555) 123-4567",
  emergencyContactName: "Michael Mitchell",
  emergencyContactPhone: "(555) 987-6543",
  releasedAt: null,
  will: {
    hasWill: true,
    locationType: "home_safe",
    locationAddress: "14 Oak Ridge Drive",
    locationDescription: "Top shelf of the black fireproof safe",
    updatedAt: "2026-01-15T00:00:00Z",
  },
  members: [janeOwnerMember, stewardSon, successorDaughter],
  createdAt: "2026-01-01T00:00:00Z",
};

const fathersVault: Vault = {
  id: fathersVaultId,
  name: "Robert Mitchell's vault",
  ownerId: "user-robert",
  ownerName: "Robert Mitchell",
  ownerEmail: "robert.mitchell@email.com",
  ownerPhone: "(555) 222-1212",
  emergencyContactName: "Jane Mitchell",
  emergencyContactPhone: "(555) 123-4567",
  releasedAt: null,
  will: {
    hasWill: true,
    locationType: "attorney_office",
    locationAddress: "Reed & Kane, Esq.",
    locationDescription: "Filed under R. Mitchell, drawer two",
    updatedAt: "2025-11-04T00:00:00Z",
  },
  members: [
    {
      id: "member-robert-owner",
      userId: "user-robert",
      name: "Robert Mitchell",
      email: "robert.mitchell@email.com",
      role: "owner",
    },
    {
      id: "member-jane-as-steward",
      userId: "user-jane",
      name: "Jane Mitchell",
      email: "jane.mitchell@email.com",
      role: "steward",
    },
  ],
  createdAt: "2025-09-12T00:00:00Z",
};

const sealedVault: Vault = {
  id: sealedVaultId,
  name: "Elena Vasquez's vault",
  ownerId: "user-elena",
  ownerName: "Elena Vasquez",
  ownerEmail: "elena@example.com",
  ownerPhone: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  releasedAt: null,
  will: { hasWill: false, locationType: "", locationAddress: "", locationDescription: "" },
  members: [],
  createdAt: "2025-06-30T00:00:00Z",
};

/**
 * In demo mode, the app pretends Jane has access to three vaults:
 *  1. Her own (owner)
 *  2. Her father's (steward) — an example of borrowed access
 *  3. A friend's (successor, sealed) — to demonstrate the locked state
 */
export const mockVaultSummaries: VaultSummary[] = [
  {
    id: janeOwnVaultId,
    name: mockVault.name,
    ownerName: mockVault.ownerName,
    ownerEmail: mockVault.ownerEmail,
    role: "owner",
    releasedAt: null,
    createdAt: mockVault.createdAt,
  },
  {
    id: fathersVaultId,
    name: fathersVault.name,
    ownerName: fathersVault.ownerName,
    ownerEmail: fathersVault.ownerEmail,
    role: "steward",
    releasedAt: null,
    createdAt: fathersVault.createdAt,
  },
  {
    id: sealedVaultId,
    name: sealedVault.name,
    ownerName: sealedVault.ownerName,
    ownerEmail: sealedVault.ownerEmail,
    role: "successor",
    releasedAt: null,
    createdAt: sealedVault.createdAt,
  },
];

export const mockVaultsById: Record<string, Vault> = {
  [janeOwnVaultId]: mockVault,
  [fathersVaultId]: fathersVault,
  [sealedVaultId]: sealedVault,
};

export const mockNotifications: Notification[] = [
  {
    id: "notif-1",
    type: "will_updated",
    message: "Will details updated",
    timestamp: "2026-02-20T00:00:00Z",
    read: false,
    vaultId: janeOwnVaultId,
  },
  {
    id: "notif-2",
    type: "member_added",
    message: "Michael Mitchell added as steward",
    timestamp: "2026-01-15T00:00:00Z",
    read: true,
    vaultId: janeOwnVaultId,
  },
];
