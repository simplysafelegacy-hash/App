import type { AccessTiming, DocumentType, MemberPermission, PlanLimits, Vault, VaultRole, VaultSummary } from "./types";

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
  releasedDocuments: DocumentType[],
) {
  if (permission.hidden) {
    return false;
  }
  if (permission.permissionRole === "steward") return permission.documentType === "will";
  if (permission.accessTiming === "now") return true;
  return vaultReleased || releasedDocuments.includes(permission.documentType);
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

export function planAllowsDocument(
  limits: PlanLimits | null | undefined,
  documentType: DocumentType,
): boolean {
  if (!limits) return true;
  switch (documentType) {
    case "will":
      return limits.allowWill;
    case "power_of_attorney":
      return limits.allowPowerOfAttorney;
    case "health_care_directive":
      return limits.allowHealthCareDirective;
  }
}
