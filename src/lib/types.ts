/**
 * Where the original will is physically kept. Free-text "other" covers
 * anything we haven't enumerated.
 */
export type WillLocationType =
  | "home_safe"
  | "bank_safety_deposit"
  | "attorney_office"
  | "other";

/**
 * Roles a user can hold on a particular vault.
 *  - owner     — the paying subscriber. Full control.
 *  - steward   — pre-event helper. May read. Cannot modify.
 *  - successor — sealed until the vault is released. Then read.
 */
export type VaultRole = "owner" | "steward" | "successor";

/**
 * Subscription plan codes — must match the Stripe price-id mapping in
 * the backend's billing handler.
 */
export type SubscriptionPlan = "individual" | "family" | "safekeeping";

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

  // Subscription state — null until the user picks a plan and Stripe
  // confirms via webhook. Used by the dashboard to display status and
  // by future feature gates.
  subscriptionStatus?: SubscriptionStatus | null;
  subscriptionPlan?: SubscriptionPlan | null;
  currentPeriodEnd?: string | null;
  trialEnd?: string | null;
}

export interface VaultMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: VaultRole;
}

export interface Will {
  hasWill: boolean;
  locationType: WillLocationType | "";
  locationAddress: string;
  locationDescription: string;
  updatedAt?: string | null;
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
  type: "will_updated" | "member_added" | "vault_released";
  message: string;
  timestamp: string | Date;
  read: boolean;
  vaultId?: string | null;
}
