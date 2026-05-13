/**
 * API client for the Simply Safe Legacy Go backend.
 *
 * Every authenticated request carries the bearer token. Requests scoped to a
 * specific vault also send the X-Vault-Id header — the backend uses this to
 * resolve the caller's role on that vault.
 *
 * Set the active vault with api.setVaultId(id) — usually called from the
 * AppContext when the user picks a vault from the switcher.
 *
 * Environment:
 *   VITE_API_URL — e.g. http://localhost:8080 (defaults to /api proxy in dev)
 */

import type {
  Notification,
  SubscriptionPlan,
  User,
  Vault,
  VaultMember,
  VaultRole,
  VaultSummary,
  Will,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "/api";

type Json =
  | Record<string, unknown>
  | Array<unknown>
  | string
  | number
  | boolean
  | null;

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: string,
  ) {
    super(message);
  }
}

let activeVaultId: string | null =
  typeof localStorage !== "undefined"
    ? localStorage.getItem("simplysafelegacy.vaultId")
    : null;

async function request<T>(
  path: string,
  opts: {
    method?: string;
    body?: Json;
    headers?: Record<string, string>;
    vaultScoped?: boolean;
  } = {},
): Promise<T> {
  const token = localStorage.getItem("simplysafelegacy.token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...opts.headers,
  };
  if (opts.vaultScoped && activeVaultId) {
    headers["X-Vault-Id"] = activeVaultId;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = (data && data.error) || res.statusText || "Request failed";
    throw new ApiError(res.status, msg, data?.detail);
  }
  return data as T;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export const api = {
  setToken(token: string | null) {
    if (token) localStorage.setItem("simplysafelegacy.token", token);
    else localStorage.removeItem("simplysafelegacy.token");
  },
  getToken: () => localStorage.getItem("simplysafelegacy.token"),

  setVaultId(id: string | null) {
    activeVaultId = id;
    if (id) localStorage.setItem("simplysafelegacy.vaultId", id);
    else localStorage.removeItem("simplysafelegacy.vaultId");
  },
  getVaultId: () => activeVaultId,

  auth: {
    google: (code: string) =>
      request<AuthResponse>("/auth/google", {
        method: "POST",
        body: { code },
      }),
    register: (data: { email: string; password: string; name: string }) =>
      request<AuthResponse>("/auth/register", {
        method: "POST",
        body: data,
      }),
    login: (data: { email: string; password: string }) =>
      request<AuthResponse>("/auth/login", {
        method: "POST",
        body: data,
      }),
    me: () => request<User>("/auth/me"),
  },

  me: {
    vaults: () => request<VaultSummary[]>("/me/vaults"),
  },

  vault: {
    get: () => request<Vault>("/vault", { vaultScoped: true }),
    create: (data: {
      name?: string;
      fullName: string;
      email: string;
      phone: string;
      emergencyContactName: string;
      emergencyContactPhone: string;
    }) =>
      request<Vault>("/vault", {
        method: "POST",
        body: data as unknown as Json,
      }),
    release: (released: boolean) =>
      request<{ releasedAt: string | null }>("/vault/release", {
        method: "POST",
        body: { released },
        vaultScoped: true,
      }),
    updateWill: (will: {
      hasWill: boolean;
      locationType?: string;
      locationAddress?: string;
      locationDescription?: string;
    }) =>
      request<Will>("/vault/will", {
        method: "PUT",
        body: will,
        vaultScoped: true,
      }),
  },

  members: {
    list: () => request<VaultMember[]>("/members", { vaultScoped: true }),
    create: (m: { name: string; email: string; role: VaultRole }) =>
      request<VaultMember>("/members", {
        method: "POST",
        body: m as unknown as Json,
        vaultScoped: true,
      }),
    update: (id: string, updates: Partial<Pick<VaultMember, "name" | "role">>) =>
      request<VaultMember>(`/members/${id}`, {
        method: "PATCH",
        body: updates as unknown as Json,
        vaultScoped: true,
      }),
    remove: (id: string) =>
      request<void>(`/members/${id}`, {
        method: "DELETE",
        vaultScoped: true,
      }),
  },

  billing: {
    // Returns a Stripe-hosted Checkout URL. The caller should
    // window.location = url to redirect.
    checkout: (plan: SubscriptionPlan) =>
      request<{ url: string }>("/billing/checkout", {
        method: "POST",
        body: { plan },
      }),
    // Returns a Stripe Customer Portal URL for managing the subscription.
    portal: () =>
      request<{ url: string }>("/billing/portal", { method: "POST" }),
  },

  notifications: {
    list: () => request<Notification[]>("/notifications"),
    markRead: (id: string) =>
      request<void>(`/notifications/${id}/read`, { method: "POST" }),
  },
};

export { ApiError };
