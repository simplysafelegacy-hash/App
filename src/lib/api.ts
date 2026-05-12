/**
 * API client for the Sealed Go backend.
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
  Document,
  Notification,
  User,
  Vault,
  VaultMember,
  VaultRole,
  VaultSummary,
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
  typeof localStorage !== "undefined" ? localStorage.getItem("sealed.vaultId") : null;

async function request<T>(
  path: string,
  opts: {
    method?: string;
    body?: Json;
    headers?: Record<string, string>;
    vaultScoped?: boolean; // attaches X-Vault-Id when true
  } = {},
): Promise<T> {
  const token = localStorage.getItem("sealed.token");
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

// -- Auth -------------------------------------------------------------------

export interface AuthResponse {
  token: string;
  user: User;
}

export interface DownloadResponse {
  url: string;
  fileName?: string;
  expiresIn: number;
}

export const api = {
  // -- Token + active vault management ------------------------------------
  setToken(token: string | null) {
    if (token) localStorage.setItem("sealed.token", token);
    else localStorage.removeItem("sealed.token");
  },
  getToken: () => localStorage.getItem("sealed.token"),

  setVaultId(id: string | null) {
    activeVaultId = id;
    if (id) localStorage.setItem("sealed.vaultId", id);
    else localStorage.removeItem("sealed.vaultId");
  },
  getVaultId: () => activeVaultId,

  // -- Auth ---------------------------------------------------------------
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

  // -- Cross-vault user info ---------------------------------------------
  me: {
    vaults: () => request<VaultSummary[]>("/me/vaults"),
  },

  // -- Vault --------------------------------------------------------------
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
      request<Vault>("/vault", { method: "POST", body: data as unknown as Json }),
    release: (released: boolean) =>
      request<{ releasedAt: string | null }>("/vault/release", {
        method: "POST",
        body: { released },
        vaultScoped: true,
      }),
  },

  // -- Documents ----------------------------------------------------------
  documents: {
    list: () => request<Document[]>("/documents", { vaultScoped: true }),
    get: (id: string) =>
      request<Document>(`/documents/${id}`, { vaultScoped: true }),
    create: (doc: {
      type: string;
      name: string;
      fileName?: string;
      locationType: string;
      address: string;
      description: string;
      memberIds: string[];
    }) =>
      request<Document>("/documents", {
        method: "POST",
        body: doc as unknown as Json,
        vaultScoped: true,
      }),
    update: (id: string, updates: Partial<Document>) =>
      request<Document>(`/documents/${id}`, {
        method: "PATCH",
        body: updates as unknown as Json,
        vaultScoped: true,
      }),
    remove: (id: string) =>
      request<void>(`/documents/${id}`, {
        method: "DELETE",
        vaultScoped: true,
      }),
    presignUpload: (id: string, filename: string, contentType: string) =>
      request<{ uploadUrl: string; fileKey: string }>(
        `/documents/${id}/upload-url`,
        {
          method: "POST",
          body: { filename, contentType },
          vaultScoped: true,
        },
      ),
    download: (id: string) =>
      request<DownloadResponse>(`/documents/${id}/download`, {
        vaultScoped: true,
      }),
  },

  // -- Members ------------------------------------------------------------
  members: {
    list: () => request<VaultMember[]>("/members", { vaultScoped: true }),
    create: (m: {
      name: string;
      email: string;
      role: VaultRole;
      documentIds?: string[];
    }) =>
      request<VaultMember>("/members", {
        method: "POST",
        body: m as unknown as Json,
        vaultScoped: true,
      }),
    update: (id: string, updates: Partial<VaultMember> & { role?: VaultRole }) =>
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

  // -- Notifications ------------------------------------------------------
  notifications: {
    list: () => request<Notification[]>("/notifications"),
    markRead: (id: string) =>
      request<void>(`/notifications/${id}/read`, { method: "POST" }),
  },
};

export { ApiError };
