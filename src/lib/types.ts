/**
 * Where an original document is physically kept. Free-text "other" covers
 * anything we haven't enumerated.
 */
export type DocumentLocationType =
  | "home_safe"
  | "bank_safety_deposit"
  | "attorney_office"
  | "other";

export type WillLocationType = DocumentLocationType;

export type DocumentType =
  | "will"
  | "power_of_attorney"
  | "health_care_directive";

/**
 * Every gate-able section of a vault. The three DocumentTypes above are
 * singular documents (a will, a POA, a directive) inlined onto the vault
 * row. The list/record sections below are backed by vault entries or a
 * dedicated record but share the same access model — the permission engine
 * gates them all the same way. Keep in sync with backend models.Section*.
 */
export type VaultSection =
  | DocumentType
  | "personal_property"
  | "non_probate"
  | "funeral"
  | "contacts";

export type AccessTiming = "now" | "after_death" | "incapacitated";

/**
 * Roles a user can hold on a particular vault.
 *  - owner             — the paying subscriber. Full control.
 *  - steward           — pre-event helper. May read. Cannot modify.
 *  - successor         — sealed until the vault is released. Then reads the will.
 *  - poa_agent         — reads the power of attorney now or after incapacity.
 *  - health_care_proxy — reads the health care directive now or after incapacity.
 */
export type VaultRole =
  | "owner"
  | "steward"
  | "successor"
  | "poa_agent"
  | "health_care_proxy";

/**
 * Subscription plan codes — must match the Stripe price-id mapping in
 * the backend's billing handler.
 */
export type SubscriptionPlan = "free" | "individual" | "family" | "safekeeping";

export interface PlanLimits {
  planCode: SubscriptionPlan;
  name: string;
  priceCents: number;
  cadence: string;
  displayOrder: number;
  maxAuthorizedPeople: number;
  allowWill: boolean;
  allowPowerOfAttorney: boolean;
  allowHealthCareDirective: boolean;
  allowPersonalProperty: boolean;
  allowNonProbate: boolean;
  allowFuneral: boolean;
  allowContacts: boolean;
  active: boolean;
}

/**
 * Stripe subscription lifecycle. Mirrors stripe-go's status values; we
 * don't enumerate every possible string here, just the ones the UI
 * branches on.
 */
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  isAdmin: boolean;

  // Subscription state — null until the user picks a plan and Stripe
  // confirms via webhook. Used by the dashboard to display status and
  // by future feature gates.
  subscriptionStatus?: SubscriptionStatus | null;
  subscriptionPlan?: SubscriptionPlan | null;
  currentPeriodEnd?: string | null;
  trialEnd?: string | null;
  planLimits?: PlanLimits | null;
}

export interface VaultMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: VaultRole;
  dateOfBirth?: string | null;
  accessTiming?: AccessTiming | null;
  permissions?: MemberPermission[];
}

export interface MemberPermission {
  id?: string;
  // A permission can target any gate-able section, including the list
  // sections (personal property, non-probate) whose steward/successor
  // permissions were added in the list-section feature.
  documentType: VaultSection;
  permissionRole: VaultRole;
  accessTiming: AccessTiming;
  hidden?: boolean;
}

export interface ReleaseRequestFile {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  storageKey: string;
}

export interface ReleaseRequest {
  id: string;
  vaultId: string;
  requesterId: string;
  documentType: DocumentType;
  releaseReason: "death" | "incapacitated";
  status: "pending" | "approved" | "rejected";
  note: string;
  files: ReleaseRequestFile[];
  createdAt: string | Date;
}

export interface Will {
  hasWill: boolean;
  locationType: DocumentLocationType | "";
  locationAddress: string;
  locationDescription: string;
  updatedAt?: string | null;
}

export interface VaultDocument {
  type: DocumentType;
  hasDocument: boolean;
  locationType: DocumentLocationType | "";
  locationAddress: string;
  locationDescription: string;
  updatedAt?: string | null;
}

/**
 * The list sections use a shared "entry + beneficiaries" shape. `section`
 * names which list an entry belongs to; `details` holds the section-specific
 * fields (e.g. an asset type for non-probate).
 */
export type ListSection = "personal_property" | "non_probate" | "contacts";

/** Roles an important contact can hold. */
export type ContactRole =
  | "attorney"
  | "financial_advisor"
  | "cpa"
  | "funeral_director"
  | "executor"
  | "trustee"
  | "family"
  | "other";

/** Kinds of non-probate asset an entry can represent. */
export type NonProbateAssetType =
  | "life_insurance"
  | "pod_tod_account"
  | "ira"
  | "retirement_401k"
  | "brokerage"
  | "trust"
  | "real_estate"
  | "other";

export interface VaultEntryBeneficiary {
  id?: string;
  name: string;
  relationship?: string;
  share?: string;
  note?: string;
  memberId?: string | null;
  sortOrder?: number;
}

export interface VaultEntry {
  id: string;
  section: ListSection;
  title: string;
  details: Record<string, unknown>;
  sortOrder: number;
  beneficiaries: VaultEntryBeneficiary[];
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** The owner's funeral & burial wishes — one record per vault. */
export type FuneralDisposition =
  | "burial"
  | "cremation"
  | "donation"
  | "undecided"
  | "";

export interface FuneralWishes {
  hasFuneral: boolean;
  disposition: FuneralDisposition;
  serviceWishes: string;
  serviceLocation: string;
  officiant: string;
  readingsMusic: string;
  prepaidProvider: string;
  notes: string;
  updatedAt?: string | null;
}

/**
 * An uploaded copy of a document, stored server-side. Only returned to a
 * caller who may read its section; the bytes are fetched through a
 * permission-checked download endpoint, never a public URL.
 */
export interface VaultAttachment {
  id: string;
  section: VaultSection;
  entryId?: string | null;
  fileName: string;
  contentType: string;
  fileSize: number;
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
  will: Will;
  documents: VaultDocument[];
  attachments: VaultAttachment[];
  entries: VaultEntry[];
  funeral: FuneralWishes;
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
  accessTiming?: AccessTiming | null;
  permissions?: MemberPermission[];
  releasedAt?: string | null;
  releasedDocuments?: VaultSection[];
  recordedDocuments?: VaultSection[];
  createdAt: string | Date;
}

export interface AdminReleaseRequestFile {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  storageKey: string;
}

export interface AdminReleaseRequest {
  id: string;
  vaultId: string;
  vaultName: string;
  ownerName: string;
  ownerEmail: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  requesterDateOfBirth: string;
  documentType: DocumentType;
  releaseReason: "death" | "incapacitated";
  status: "pending" | "approved" | "rejected";
  note: string;
  createdAt: string | Date;
  reviewedAt?: string | Date | null;
  reviewedBy?: string;
  reviewedByEmail?: string;
  files: AdminReleaseRequestFile[];
}

export interface Notification {
  id: string;
  type: "will_updated" | "document_updated" | "member_added" | "vault_released";
  message: string;
  timestamp: string | Date;
  read: boolean;
  vaultId?: string | null;
}
