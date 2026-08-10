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
  AdminReleaseRequest,
  Notification,
  DocumentType,
  FuneralWishes,
  ListSection,
  PlanLimits,
  ReleaseRequest,
  SubscriptionPlan,
  User,
  Vault,
  MemberPermission,
  VaultAttachment,
  VaultDocument,
  VaultEntry,
  VaultEntryBeneficiary,
  VaultMember,
  VaultRole,
  VaultSection,
  VaultSummary,
  Will,
} from "./types";

/** Payload for creating or updating a list entry. */
export interface EntryInput {
  section: ListSection;
  title: string;
  details: Record<string, unknown>;
  sortOrder?: number;
  beneficiaries: VaultEntryBeneficiary[];
}

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

async function upload<T>(path: string, body: FormData): Promise<T> {
  const token = localStorage.getItem("simplysafelegacy.token");
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (activeVaultId) headers["X-Vault-Id"] = activeVaultId;

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && data.error) || res.statusText || "Request failed";
    throw new ApiError(res.status, msg, data?.detail);
  }
  return data as T;
}

async function download(
  path: string,
  opts: { vaultScoped?: boolean } = {},
): Promise<Blob> {
  const token = localStorage.getItem("simplysafelegacy.token");
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (opts.vaultScoped && activeVaultId) headers["X-Vault-Id"] = activeVaultId;
  const res = await fetch(`${API_URL}${path}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    let data: { error?: string; detail?: string } | null = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    throw new ApiError(res.status, data?.error || res.statusText || "Download failed", data?.detail);
  }
  return res.blob();
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
      request<{ releasedAt: string | null; releasedDocuments?: DocumentType[] }>("/vault/release", {
        method: "POST",
        body: { released },
        vaultScoped: true,
      }),
    resealDocument: (type: DocumentType) =>
      request<{ documentType: DocumentType }>(`/vault/document-releases/${type}`, {
        method: "DELETE",
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
    updateDocument: (
      type: DocumentType,
      document: {
        hasDocument: boolean;
        locationType?: string;
        locationAddress?: string;
        locationDescription?: string;
      },
    ) =>
      request<VaultDocument>(`/vault/documents/${type}`, {
        method: "PUT",
        body: document as unknown as Json,
        vaultScoped: true,
      }),
  },

  members: {
    list: () => request<VaultMember[]>("/members", { vaultScoped: true }),
    create: (m: {
      name: string;
      email: string;
      role: VaultRole;
      dateOfBirth?: string;
      accessTiming?: string;
      permissions?: MemberPermission[];
    }) =>
      request<VaultMember>("/members", {
        method: "POST",
        body: m as unknown as Json,
        vaultScoped: true,
      }),
    update: (
      id: string,
      updates: Partial<Pick<VaultMember, "name" | "role" | "permissions">>,
    ) =>
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

  releaseRequests: {
    list: () => request<ReleaseRequest[]>("/vault/release-requests", { vaultScoped: true }),
    create: (data: {
      documentType: string;
      releaseReason: string;
      note?: string;
      files: File[];
    }) => {
      const form = new FormData();
      form.set("documentType", data.documentType);
      form.set("releaseReason", data.releaseReason);
      if (data.note) form.set("note", data.note);
      data.files.forEach((file) => form.append("files", file));
      return upload<ReleaseRequest>("/vault/release-requests", form);
    },
  },

  attachments: {
    list: () =>
      request<VaultAttachment[]>("/vault/attachments", { vaultScoped: true }),
    upload: (section: VaultSection, file: File) => {
      const form = new FormData();
      form.set("section", section);
      form.append("files", file);
      return upload<VaultAttachment>("/vault/attachments", form);
    },
    download: (id: string) =>
      download(`/vault/attachments/${id}/download`, { vaultScoped: true }),
    remove: (id: string) =>
      request<void>(`/vault/attachments/${id}`, {
        method: "DELETE",
        vaultScoped: true,
      }),
  },

  entries: {
    list: (section: ListSection) =>
      request<VaultEntry[]>(
        `/vault/entries?section=${encodeURIComponent(section)}`,
        { vaultScoped: true },
      ),
    create: (data: EntryInput) =>
      request<VaultEntry>("/vault/entries", {
        method: "POST",
        body: data as unknown as Json,
        vaultScoped: true,
      }),
    update: (id: string, data: EntryInput) =>
      request<VaultEntry>(`/vault/entries/${id}`, {
        method: "PUT",
        body: data as unknown as Json,
        vaultScoped: true,
      }),
    remove: (id: string) =>
      request<void>(`/vault/entries/${id}`, {
        method: "DELETE",
        vaultScoped: true,
      }),
  },

  funeral: {
    update: (data: {
      hasFuneral: boolean;
      disposition?: string;
      serviceWishes?: string;
      serviceLocation?: string;
      officiant?: string;
      readingsMusic?: string;
      prepaidProvider?: string;
      notes?: string;
    }) =>
      request<FuneralWishes>("/vault/funeral", {
        method: "PUT",
        body: data,
        vaultScoped: true,
      }),
  },

  admin: {
    releaseRequests: (status: "pending" | "approved" | "rejected" | "all" = "pending") =>
      request<AdminReleaseRequest[]>(`/admin/release-requests?status=${encodeURIComponent(status)}`),
    approveReleaseRequest: (id: string, note?: string) =>
      request<AdminReleaseRequest>(`/admin/release-requests/${id}/approve`, {
        method: "POST",
        body: { note: note ?? "" },
      }),
    rejectReleaseRequest: (id: string, note?: string) =>
      request<AdminReleaseRequest>(`/admin/release-requests/${id}/reject`, {
        method: "POST",
        body: { note: note ?? "" },
      }),
    downloadReleaseFile: (id: string) =>
      download(`/admin/release-request-files/${id}/download`),
  },

  billing: {
    plans: () => request<PlanLimits[]>("/billing/plans"),
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

  support: {
    createTicket: (data: { subject: string; message: string }) =>
      request<{ status: string }>("/support/tickets", {
        method: "POST",
        body: data,
      }),
  },

  notifications: {
    list: () => request<Notification[]>("/notifications"),
    markRead: (id: string) =>
      request<void>(`/notifications/${id}/read`, { method: "POST" }),
  },
};

export { ApiError };
