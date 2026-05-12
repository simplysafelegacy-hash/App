import type {
  Document,
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
  documentIds: [],
};

const stewardSon: VaultMember = {
  id: "member-michael-steward",
  userId: "user-michael",
  name: "Michael Mitchell",
  email: "michael.mitchell@email.com",
  role: "steward",
  documentIds: ["doc-jane-1", "doc-jane-2"],
};

const successorDaughter: VaultMember = {
  id: "member-anna-successor",
  userId: "",
  name: "Anna Mitchell",
  email: "anna.mitchell@email.com",
  role: "successor",
  documentIds: ["doc-jane-1"],
};

const janesDocuments: Document[] = [
  {
    id: "doc-jane-1",
    type: "will",
    name: "Last Will and Testament",
    fileName: "will_2026.pdf",
    hasFile: true,
    locationType: "home_safe",
    address: "14 Oak Ridge Drive",
    description: "Top shelf, black fireproof safe",
    memberIds: ["member-michael-steward", "member-anna-successor"],
    lastUpdated: "2026-01-15T00:00:00Z",
    createdAt: "2026-01-10T00:00:00Z",
  },
  {
    id: "doc-jane-2",
    type: "power_of_attorney",
    name: "Durable Power of Attorney",
    fileName: "poa_2026.pdf",
    hasFile: true,
    locationType: "gun_sitters_vault",
    address: "221 Industrial Way",
    description: "Box #14",
    memberIds: ["member-michael-steward"],
    lastUpdated: "2026-02-20T00:00:00Z",
    createdAt: "2026-02-18T00:00:00Z",
  },
];

const fathersDocuments: Document[] = [
  {
    id: "doc-robert-1",
    type: "trust",
    name: "Mitchell Family Trust",
    fileName: "trust.pdf",
    hasFile: true,
    locationType: "attorney_office",
    address: "Reed & Kane, Esq.",
    description: "Filed under R. Mitchell, drawer two",
    memberIds: ["member-jane-as-steward"],
    lastUpdated: "2025-11-04T00:00:00Z",
    createdAt: "2025-11-04T00:00:00Z",
  },
];

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
  documents: janesDocuments,
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
  documents: fathersDocuments,
  members: [
    {
      id: "member-robert-owner",
      userId: "user-robert",
      name: "Robert Mitchell",
      email: "robert.mitchell@email.com",
      role: "owner",
      documentIds: [],
    },
    {
      id: "member-jane-as-steward",
      userId: "user-jane",
      name: "Jane Mitchell",
      email: "jane.mitchell@email.com",
      role: "steward",
      documentIds: ["doc-robert-1"],
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
  documents: [], // sealed for successors before release
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
    type: "document_added",
    message: "Power of Attorney document added",
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

export const documentTypeLabels: Record<string, string> = {
  will: "Will",
  power_of_attorney: "Power of Attorney",
  living_will: "Living Will",
  trust: "Trust",
  deed: "Deed",
  life_insurance: "Life Insurance",
  beneficiary_form: "Beneficiary Form",
  other: "Other",
};

export const locationTypeLabels: Record<string, string> = {
  home_safe: "Home Safe",
  bank_safety_deposit: "Bank Safety Deposit Box",
  attorney_office: "Attorney Office",
  gun_sitters_vault: "Gun Sitters Vault",
  other: "Other",
};
