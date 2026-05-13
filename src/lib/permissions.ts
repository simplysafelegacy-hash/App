import type { Vault, VaultRole, VaultSummary } from "./types";

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
  isSealed: boolean; // successor + vault not yet released
}

export function permissionsFor(
  role: VaultRole | null | undefined,
  released: boolean,
): Permissions {
  const isOwner = role === "owner";
  const isSteward = role === "steward";
  const isSuccessor = role === "successor";
  const canRead = isOwner || isSteward || (isSuccessor && released);
  const canModify = isOwner;
  return {
    canRead,
    canModify,
    isOwner,
    isSteward,
    isSuccessor,
    isSealed: isSuccessor && !released,
  };
}

export function permissionsForVault(
  vault: Vault | null | undefined,
  summary: VaultSummary | null | undefined,
): Permissions {
  const role = summary?.role ?? null;
  const released = Boolean(vault?.releasedAt ?? summary?.releasedAt);
  return permissionsFor(role, released);
}

export const roleLabel: Record<VaultRole, string> = {
  owner: "Owner",
  steward: "Steward",
  successor: "Successor",
};

export const roleDescription: Record<VaultRole, string> = {
  owner: "Holds the vault. Adds, amends, and releases its contents.",
  steward: "Trusted now. May see the vault and where the will is kept.",
  successor:
    "Trusted later. Sealed out until the vault has been released by its owner.",
};

export const willLocationLabel: Record<string, string> = {
  home_safe: "Home safe",
  bank_safety_deposit: "Bank safety deposit box",
  attorney_office: "Attorney's office",
  other: "Other",
};
