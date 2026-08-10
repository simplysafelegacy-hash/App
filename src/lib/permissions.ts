import type { AccessTiming, ContactRole, DocumentType, MemberPermission, NonProbateAssetType, PlanLimits, Vault, VaultRole, VaultSection, VaultSummary } from "./types";

/**
 * Permission predicates derived from a user's role on a vault and that
 * vault's release state. Mirrors the backend's CtxVault helpers — keep these
 * in sync with backend/internal/handlers/permissions.go.
 */
export interface Permissions {
  canRead: boolean;
  canModify: boolean;
  isOwner: boolean;
  isSteward: boolean;
  isSuccessor: boolean;
  isPoaAgent: boolean;
  isHealthCareProxy: boolean;
  isSealed: boolean; // successor + vault not yet released
}

export function permissionsFor(
  role: VaultRole | null | undefined,
  released: boolean,
  accessTiming?: AccessTiming | null,
): Permissions {
  const isOwner = role === "owner";
  const isSteward = role === "steward";
  const isSuccessor = role === "successor";
  const isPoaAgent = role === "poa_agent";
  const isHealthCareProxy = role === "health_care_proxy";
  const delayed = accessTiming === "after_death" || accessTiming === "incapacitated";
  const canRead =
    isOwner ||
    isSteward ||
    (isSuccessor && released) ||
    ((isPoaAgent || isHealthCareProxy) && (!delayed || released));
  const canModify = isOwner;
  return {
    canRead,
    canModify,
    isOwner,
    isSteward,
    isSuccessor,
    isPoaAgent,
    isHealthCareProxy,
    isSealed: Boolean(role) && !canRead,
  };
}

export function permissionsForVault(
  vault: Vault | null | undefined,
  summary: VaultSummary | null | undefined,
): Permissions {
  const role = summary?.role ?? null;
  const released = Boolean(vault?.releasedAt ?? summary?.releasedAt);
  const releasedDocuments = summary?.releasedDocuments ?? [];
  const memberPermissions = summary?.permissions ?? [];
  const hasReadablePermission = memberPermissions.some((permission) =>
    permissionCanRead(permission, released, releasedDocuments),
  );
  const documentReleased = releasedDocuments.length > 0;
  const base = permissionsFor(role, released || documentReleased, summary?.accessTiming);
  const canRead =
    memberPermissions.length > 0 && role !== "owner"
      ? hasReadablePermission
      : base.canRead || hasReadablePermission;
  return { ...base, canRead, isSealed: Boolean(role) && !canRead };
}

function permissionCanRead(
  permission: MemberPermission,
  vaultReleased: boolean,
  releasedDocuments: VaultSection[],
) {
  if (permission.hidden) {
    return false;
  }
  const released =
    vaultReleased || releasedDocuments.includes(permission.documentType);
  // steward/successor are generic "read now" / "read after release" roles that
  // apply to any section. POA / health-care-proxy follow their own timing.
  if (permission.permissionRole === "successor") return released;
  if (permission.permissionRole === "steward") {
    return permission.accessTiming === "now" || released;
  }
  if (permission.accessTiming === "now") return true;
  return released;
}

export const roleLabel: Record<VaultRole, string> = {
  owner: "Owner",
  steward: "Steward",
  successor: "Successor",
  poa_agent: "Power of Attorney Agent",
  health_care_proxy: "Health Care Proxy",
};

export const roleDescription: Record<VaultRole, string> = {
  owner: "Holds the vault. Adds, amends, and releases its contents.",
  steward: "Trusted now. May see the vault documents and where they're kept.",
  successor:
    "Trusted after death. Can see the will after the vault is released.",
  poa_agent:
    "Named for the power of attorney. Access can start now or after incapacity is verified.",
  health_care_proxy:
    "Named for the health care directive. Access can start now or after incapacity is verified.",
};

export const willLocationLabel: Record<string, string> = {
  home_safe: "Home safe",
  bank_safety_deposit: "Bank safety deposit box",
  attorney_office: "Attorney's office",
  other: "Other",
};

export const accessTimingLabel: Record<AccessTiming, string> = {
  now: "Now",
  after_death: "After death",
  incapacitated: "After incapacitated",
};

export const documentLabel: Record<DocumentType, string> = {
  will: "Will",
  power_of_attorney: "Power of attorney",
  health_care_directive: "Health care directive",
};

export const sectionLabel: Record<VaultSection, string> = {
  will: "Will",
  power_of_attorney: "Power of attorney",
  health_care_directive: "Health care directive",
  personal_property: "Personal property",
  non_probate: "Non-probate assets",
  funeral: "Funeral & burial",
  contacts: "Important contacts",
};

export const contactRoleLabel: Record<ContactRole, string> = {
  attorney: "Attorney",
  financial_advisor: "Financial advisor",
  cpa: "CPA / accountant",
  funeral_director: "Funeral director",
  executor: "Executor",
  trustee: "Trustee",
  family: "Family",
  other: "Other",
};

export const nonProbateAssetLabel: Record<NonProbateAssetType, string> = {
  life_insurance: "Life insurance policy",
  pod_tod_account: "POD / TOD account",
  ira: "IRA",
  retirement_401k: "401(k) / retirement plan",
  brokerage: "Brokerage account",
  trust: "Trust",
  real_estate: "Real estate (survivorship / joint)",
  other: "Other",
};

export function planAllowsDocument(
  limits: PlanLimits | null | undefined,
  section: VaultSection,
): boolean {
  if (!limits) return true;
  switch (section) {
    case "will":
      return limits.allowWill;
    case "power_of_attorney":
      return limits.allowPowerOfAttorney;
    case "health_care_directive":
      return limits.allowHealthCareDirective;
    case "personal_property":
      return limits.allowPersonalProperty;
    case "non_probate":
      return limits.allowNonProbate;
    case "funeral":
      return limits.allowFuneral;
    case "contacts":
      return limits.allowContacts;
  }
}
