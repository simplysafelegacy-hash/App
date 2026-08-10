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
  isAdmin: true,
  subscriptionStatus: "active",
  subscriptionPlan: "family",
  currentPeriodEnd: "2027-03-01T00:00:00Z",
  planLimits: {
    planCode: "family",
    name: "Family",
    priceCents: 2000,
    cadence: "per month",
    displayOrder: 30,
    maxAuthorizedPeople: 15,
    allowWill: true,
    allowPowerOfAttorney: true,
    allowHealthCareDirective: true,
    allowPersonalProperty: true,
    allowNonProbate: true,
    allowFuneral: true,
    allowContacts: true,
    active: true,
  },
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
  dateOfBirth: "1991-08-12",
  accessTiming: "now",
  permissions: [
    {
      documentType: "will",
      permissionRole: "steward",
      accessTiming: "now",
      hidden: false,
    },
  ],
};

const successorDaughter: VaultMember = {
  id: "member-anna-successor",
  userId: "",
  name: "Anna Mitchell",
  email: "anna.mitchell@email.com",
  role: "successor",
  dateOfBirth: "1994-03-05",
  accessTiming: "after_death",
  permissions: [
    {
      documentType: "will",
      permissionRole: "successor",
      accessTiming: "after_death",
      hidden: false,
    },
  ],
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
  documents: [
    {
      type: "will",
      hasDocument: true,
      locationType: "home_safe",
      locationAddress: "14 Oak Ridge Drive",
      locationDescription: "Top shelf of the black fireproof safe",
      updatedAt: "2026-01-15T00:00:00Z",
    },
    {
      type: "power_of_attorney",
      hasDocument: true,
      locationType: "attorney_office",
      locationAddress: "Reed & Kane, Esq.",
      locationDescription: "Signed original in Jane Mitchell estate folder",
      updatedAt: "2026-02-02T00:00:00Z",
    },
    {
      type: "health_care_directive",
      hasDocument: true,
      locationType: "home_safe",
      locationAddress: "14 Oak Ridge Drive",
      locationDescription: "Blue folder labeled health directive",
      updatedAt: "2026-02-02T00:00:00Z",
    },
  ],
  attachments: [
    {
      id: "attachment-jane-will",
      section: "will",
      entryId: null,
      fileName: "last-will-and-testament.pdf",
      contentType: "application/pdf",
      fileSize: 248_113,
      createdAt: "2026-01-15T00:00:00Z",
    },
  ],
  entries: [
    {
      id: "entry-ring",
      section: "personal_property",
      title: "Grandmother's wedding ring",
      details: {
        description: "Platinum band with a small sapphire",
        location: "Jewelry box, top drawer of the bedroom dresser",
      },
      sortOrder: 0,
      beneficiaries: [
        {
          id: "ben-ring-1",
          name: "Emma Mitchell",
          relationship: "Daughter",
          share: "Full item",
          note: "",
        },
      ],
      createdAt: "2026-01-20T00:00:00Z",
      updatedAt: "2026-01-20T00:00:00Z",
    },
    {
      id: "entry-metlife",
      section: "non_probate",
      title: "MetLife term life policy",
      details: {
        assetType: "life_insurance",
        institution: "MetLife",
        reference: "Policy #ML-4831902",
        ownership: "Individual",
        notes: "Term policy, expires 2039",
      },
      sortOrder: 0,
      beneficiaries: [
        {
          id: "ben-metlife-1",
          name: "Emma Mitchell",
          relationship: "Daughter",
          share: "50%",
          note: "",
        },
        {
          id: "ben-metlife-2",
          name: "Daniel Mitchell",
          relationship: "Son",
          share: "50%",
          note: "",
        },
      ],
      createdAt: "2026-01-22T00:00:00Z",
      updatedAt: "2026-01-22T00:00:00Z",
    },
    {
      id: "entry-contact-attorney",
      section: "contacts",
      title: "Sarah Reed",
      details: {
        role: "attorney",
        organization: "Reed & Kane, Esq.",
        phone: "(555) 341-8890",
        email: "sreed@reedkane.example",
        notes: "Drafted the will and power of attorney",
      },
      sortOrder: 0,
      beneficiaries: [],
      createdAt: "2026-01-25T00:00:00Z",
      updatedAt: "2026-01-25T00:00:00Z",
    },
  ],
  funeral: {
    hasFuneral: true,
    disposition: "cremation",
    serviceWishes: "Small graveside gathering, no formal service",
    serviceLocation: "Oak Ridge Memorial Gardens",
    officiant: "",
    readingsMusic: "Play 'Clair de Lune'",
    prepaidProvider: "Oak Ridge — plan #OR-2291",
    notes: "",
    updatedAt: "2026-01-28T00:00:00Z",
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
  documents: [
    {
      type: "will",
      hasDocument: true,
      locationType: "attorney_office",
      locationAddress: "Reed & Kane, Esq.",
      locationDescription: "Filed under R. Mitchell, drawer two",
      updatedAt: "2025-11-04T00:00:00Z",
    },
  ],
  attachments: [],
  entries: [],
  funeral: {
    hasFuneral: false,
    disposition: "",
    serviceWishes: "",
    serviceLocation: "",
    officiant: "",
    readingsMusic: "",
    prepaidProvider: "",
    notes: "",
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
      dateOfBirth: "1989-04-18",
      accessTiming: "now",
      permissions: [
        {
          documentType: "will",
          permissionRole: "steward",
          accessTiming: "now",
          hidden: false,
        },
      ],
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
  documents: [],
  attachments: [],
  entries: [],
  funeral: {
    hasFuneral: false,
    disposition: "",
    serviceWishes: "",
    serviceLocation: "",
    officiant: "",
    readingsMusic: "",
    prepaidProvider: "",
    notes: "",
  },
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
    accessTiming: "now",
    releasedAt: null,
    createdAt: mockVault.createdAt,
  },
  {
    id: fathersVaultId,
    name: fathersVault.name,
    ownerName: fathersVault.ownerName,
    ownerEmail: fathersVault.ownerEmail,
    role: "steward",
    accessTiming: "now",
    releasedAt: null,
    createdAt: fathersVault.createdAt,
  },
  {
    id: sealedVaultId,
    name: sealedVault.name,
    ownerName: sealedVault.ownerName,
    ownerEmail: sealedVault.ownerEmail,
    role: "successor",
    accessTiming: "after_death",
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
