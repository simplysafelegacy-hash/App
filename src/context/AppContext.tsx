import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import {
  Document,
  Notification,
  User,
  Vault,
  VaultMember,
  VaultRole,
  VaultSummary,
} from "@/lib/types";
import { api } from "@/lib/api";
import { permissionsForVault, type Permissions } from "@/lib/permissions";
import {
  mockNotifications,
  mockOwner,
  mockVaultSummaries,
  mockVaultsById,
} from "@/lib/mockData";

const DEMO_MODE = (import.meta.env.VITE_DEMO_MODE ?? "true") === "true";

interface AppContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  loading: boolean;

  // Multi-vault state
  vaults: VaultSummary[]; // every vault the user has access to
  currentVaultId: string | null;
  currentVaultSummary: VaultSummary | null;
  vault: Vault | null; // full data for current vault
  permissions: Permissions;

  notifications: Notification[];

  // Auth — Google OAuth and email/password live side by side. Each
  // returns { newUser } so the caller can route first-time accounts to
  // the create-vault flow.
  signInWithGoogle: (code: string) => Promise<{ newUser: boolean }>;
  signUpWithPassword: (data: {
    email: string;
    password: string;
    name: string;
  }) => Promise<{ newUser: boolean }>;
  signInWithPassword: (data: {
    email: string;
    password: string;
  }) => Promise<{ newUser: boolean }>;
  logout: () => void;

  // Vault actions
  selectVault: (id: string) => Promise<void>;
  createVault: (data: {
    fullName: string;
    email: string;
    phone: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
  }) => Promise<void>;
  releaseVault: (released: boolean) => Promise<void>;
  refreshVault: () => Promise<void>;

  // Documents (owner only for mutations)
  addDocument: (
    document: Omit<Document, "id" | "createdAt" | "lastUpdated" | "hasFile">,
  ) => Promise<Document | null>;
  updateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  downloadDocument: (id: string) => Promise<void>;

  // Members (owner only)
  addMember: (m: {
    name: string;
    email: string;
    role: VaultRole;
    documentIds?: string[];
  }) => Promise<VaultMember | null>;
  updateMember: (
    id: string,
    updates: Partial<VaultMember> & { role?: VaultRole },
  ) => Promise<void>;
  removeMember: (id: string) => Promise<void>;

  markNotificationRead: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [vaults, setVaults] = useState<VaultSummary[]>([]);
  const [currentVaultId, setCurrentVaultId] = useState<string | null>(null);
  const [vault, setVault] = useState<Vault | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const isAuthenticated = currentUser !== null;
  const currentVaultSummary = useMemo(
    () => vaults.find((v) => v.id === currentVaultId) ?? null,
    [vaults, currentVaultId],
  );
  const permissions = useMemo(
    () => permissionsForVault(vault, currentVaultSummary),
    [vault, currentVaultSummary],
  );

  // Restore session on mount.
  useEffect(() => {
    if (DEMO_MODE) {
      setLoading(false);
      return;
    }
    const token = api.getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const user = await api.auth.me();
        setCurrentUser(user);
        await loadVaults();
        const n = await api.notifications.list();
        setNotifications(n);
      } catch {
        api.setToken(null);
        api.setVaultId(null);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- internal helpers --------------------------------------------------

  const loadVaults = useCallback(async (): Promise<VaultSummary[]> => {
    if (DEMO_MODE) {
      setVaults(mockVaultSummaries);
      const stored = api.getVaultId();
      const initial =
        (stored && mockVaultsById[stored] && stored) ||
        mockVaultSummaries[0]?.id ||
        null;
      if (initial) {
        api.setVaultId(initial);
        setCurrentVaultId(initial);
        setVault(mockVaultsById[initial] ?? null);
      }
      return mockVaultSummaries;
    }
    const list = await api.me.vaults();
    setVaults(list);
    const stored = api.getVaultId();
    const exists = stored && list.some((v) => v.id === stored);
    const initial = exists ? stored : list[0]?.id ?? null;
    if (initial) {
      api.setVaultId(initial);
      setCurrentVaultId(initial);
      const v = await api.vault.get();
      setVault(v);
    } else {
      api.setVaultId(null);
      setCurrentVaultId(null);
      setVault(null);
    }
    return list;
  }, []);

  // -- auth -------------------------------------------------------------

  // afterAuth runs the post-token bookkeeping shared by every sign-in
  // path: hydrate the user, load their vaults, pull notifications, and
  // report whether they need the create-vault flow.
  const afterAuth = useCallback(
    async (res: { token: string; user: User }): Promise<{ newUser: boolean }> => {
      api.setToken(res.token);
      setCurrentUser(res.user);
      const list = await loadVaults();
      try {
        const n = await api.notifications.list();
        setNotifications(n);
      } catch {
        // notifications are non-critical
      }
      return { newUser: list.length === 0 };
    },
    [loadVaults],
  );

  const signInWithGoogle = useCallback(
    async (code: string): Promise<{ newUser: boolean }> => {
      if (DEMO_MODE) {
        setCurrentUser(mockOwner);
        const list = await loadVaults();
        setNotifications(mockNotifications);
        return { newUser: list.length === 0 };
      }
      const res = await api.auth.google(code);
      return afterAuth(res);
    },
    [loadVaults, afterAuth],
  );

  const signUpWithPassword = useCallback(
    async (data: {
      email: string;
      password: string;
      name: string;
    }): Promise<{ newUser: boolean }> => {
      if (DEMO_MODE) {
        setCurrentUser({ ...mockOwner, email: data.email, name: data.name });
        await loadVaults();
        setNotifications(mockNotifications);
        // Brand-new password signups always start without a vault.
        return { newUser: true };
      }
      const res = await api.auth.register(data);
      return afterAuth(res);
    },
    [loadVaults, afterAuth],
  );

  const signInWithPassword = useCallback(
    async (data: {
      email: string;
      password: string;
    }): Promise<{ newUser: boolean }> => {
      if (DEMO_MODE) {
        setCurrentUser({ ...mockOwner, email: data.email });
        const list = await loadVaults();
        setNotifications(mockNotifications);
        return { newUser: list.length === 0 };
      }
      const res = await api.auth.login(data);
      return afterAuth(res);
    },
    [loadVaults, afterAuth],
  );

  const logout = useCallback(() => {
    api.setToken(null);
    api.setVaultId(null);
    setCurrentUser(null);
    setVaults([]);
    setCurrentVaultId(null);
    setVault(null);
    setNotifications([]);
  }, []);

  // -- vault selection ---------------------------------------------------

  const selectVault = useCallback(async (id: string) => {
    api.setVaultId(id);
    setCurrentVaultId(id);
    if (DEMO_MODE) {
      setVault(mockVaultsById[id] ?? null);
      return;
    }
    try {
      const v = await api.vault.get();
      setVault(v);
    } catch {
      setVault(null);
    }
  }, []);

  const refreshVault = useCallback(async () => {
    if (!currentVaultId) return;
    if (DEMO_MODE) {
      setVault(mockVaultsById[currentVaultId] ?? null);
      return;
    }
    const v = await api.vault.get();
    setVault(v);
  }, [currentVaultId]);

  // -- vault mutations ---------------------------------------------------

  const pushNotification = useCallback(
    (n: Omit<Notification, "id" | "timestamp" | "read">) => {
      setNotifications((prev) => [
        {
          ...n,
          id: `notif-${Date.now()}`,
          timestamp: new Date().toISOString(),
          read: false,
        },
        ...prev,
      ]);
    },
    [],
  );

  const createVault = useCallback(
    async (data: {
      fullName: string;
      email: string;
      phone: string;
      emergencyContactName: string;
      emergencyContactPhone: string;
    }) => {
      if (DEMO_MODE) {
        const local: Vault = {
          id: `vault-${Date.now()}`,
          name: `${data.fullName}'s vault`,
          ownerId: currentUser?.id ?? "",
          ownerName: data.fullName,
          ownerEmail: data.email,
          ownerPhone: data.phone,
          emergencyContactName: data.emergencyContactName,
          emergencyContactPhone: data.emergencyContactPhone,
          releasedAt: null,
          documents: [],
          members: [
            {
              id: `member-${Date.now()}`,
              userId: currentUser?.id ?? "",
              name: data.fullName,
              email: data.email,
              role: "owner",
              documentIds: [],
            },
          ],
          createdAt: new Date().toISOString(),
        };
        setVault(local);
        const summary: VaultSummary = {
          id: local.id,
          name: local.name,
          ownerName: local.ownerName,
          ownerEmail: local.ownerEmail,
          role: "owner",
          releasedAt: null,
          createdAt: local.createdAt,
        };
        setVaults((prev) => [summary, ...prev]);
        api.setVaultId(local.id);
        setCurrentVaultId(local.id);
        if (currentUser) {
          setCurrentUser({
            ...currentUser,
            name: data.fullName,
            email: data.email,
            phone: data.phone,
          });
        }
        return;
      }
      const v = await api.vault.create(data);
      api.setVaultId(v.id);
      setCurrentVaultId(v.id);
      setVault(v);
      await loadVaults();
    },
    [currentUser, loadVaults],
  );

  const releaseVault = useCallback(
    async (released: boolean) => {
      if (!vault) return;
      const releasedAt = released ? new Date().toISOString() : null;
      if (DEMO_MODE) {
        setVault({ ...vault, releasedAt });
        setVaults((prev) =>
          prev.map((s) => (s.id === vault.id ? { ...s, releasedAt } : s)),
        );
        return;
      }
      const res = await api.vault.release(released);
      setVault({ ...vault, releasedAt: res.releasedAt });
      setVaults((prev) =>
        prev.map((s) =>
          s.id === vault.id ? { ...s, releasedAt: res.releasedAt } : s,
        ),
      );
    },
    [vault],
  );

  // -- documents ---------------------------------------------------------

  const addDocument = useCallback(
    async (
      doc: Omit<Document, "id" | "createdAt" | "lastUpdated" | "hasFile">,
    ): Promise<Document | null> => {
      if (!vault) return null;
      let created: Document;
      if (DEMO_MODE) {
        created = {
          ...doc,
          id: `doc-${Date.now()}`,
          hasFile: !!doc.fileName,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        };
      } else {
        created = await api.documents.create({
          type: doc.type,
          name: doc.name,
          fileName: doc.fileName,
          locationType: doc.locationType,
          address: doc.address,
          description: doc.description,
          memberIds: doc.memberIds,
        });
      }
      setVault({ ...vault, documents: [...vault.documents, created] });
      pushNotification({
        type: "document_added",
        message: `${created.name} added to vault`,
        vaultId: vault.id,
      });
      return created;
    },
    [vault, pushNotification],
  );

  const updateDocument = useCallback(
    async (id: string, updates: Partial<Document>) => {
      if (!vault) return;
      const updated = DEMO_MODE
        ? null
        : await api.documents.update(id, updates);
      setVault({
        ...vault,
        documents: vault.documents.map((d) =>
          d.id === id
            ? updated ?? {
                ...d,
                ...updates,
                lastUpdated: new Date().toISOString(),
              }
            : d,
        ),
      });
      pushNotification({
        type: "document_updated",
        message: "Document updated",
        vaultId: vault.id,
      });
    },
    [vault, pushNotification],
  );

  const deleteDocument = useCallback(
    async (id: string) => {
      if (!vault) return;
      if (!DEMO_MODE) await api.documents.remove(id);
      setVault({
        ...vault,
        documents: vault.documents.filter((d) => d.id !== id),
      });
    },
    [vault],
  );

  const downloadDocument = useCallback(
    async (id: string) => {
      if (DEMO_MODE) {
        // Demo: there's no actual file. Open a placeholder.
        window.open("/placeholder.svg", "_blank");
        return;
      }
      const res = await api.documents.download(id);
      // Open in a new tab so the browser handles the download.
      window.open(res.url, "_blank", "noopener");
    },
    [],
  );

  // -- members -----------------------------------------------------------

  const addMember = useCallback(
    async (m: {
      name: string;
      email: string;
      role: VaultRole;
      documentIds?: string[];
    }): Promise<VaultMember | null> => {
      if (!vault) return null;
      const created: VaultMember = DEMO_MODE
        ? {
            id: `member-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            userId: "",
            name: m.name,
            email: m.email,
            role: m.role,
            documentIds: m.documentIds ?? [],
          }
        : await api.members.create(m);
      setVault({ ...vault, members: [...vault.members, created] });
      pushNotification({
        type: "member_added",
        message: `${created.name} added as ${created.role}`,
        vaultId: vault.id,
      });
      return created;
    },
    [vault, pushNotification],
  );

  const updateMember = useCallback(
    async (
      id: string,
      updates: Partial<VaultMember> & { role?: VaultRole },
    ) => {
      if (!vault) return;
      const updated = DEMO_MODE ? null : await api.members.update(id, updates);
      setVault({
        ...vault,
        members: vault.members.map((m) =>
          m.id === id ? updated ?? { ...m, ...updates } : m,
        ),
      });
    },
    [vault],
  );

  const removeMember = useCallback(
    async (id: string) => {
      if (!vault) return;
      if (!DEMO_MODE) await api.members.remove(id);
      setVault({
        ...vault,
        members: vault.members.filter((m) => m.id !== id),
      });
    },
    [vault],
  );

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    if (!DEMO_MODE) api.notifications.markRead(id).catch(() => {});
  }, []);

  const value = useMemo<AppContextType>(
    () => ({
      currentUser,
      isAuthenticated,
      loading,
      vaults,
      currentVaultId,
      currentVaultSummary,
      vault,
      permissions,
      notifications,
      signInWithGoogle,
      signUpWithPassword,
      signInWithPassword,
      logout,
      selectVault,
      createVault,
      releaseVault,
      refreshVault,
      addDocument,
      updateDocument,
      deleteDocument,
      downloadDocument,
      addMember,
      updateMember,
      removeMember,
      markNotificationRead,
    }),
    [
      currentUser,
      isAuthenticated,
      loading,
      vaults,
      currentVaultId,
      currentVaultSummary,
      vault,
      permissions,
      notifications,
      signInWithGoogle,
      signUpWithPassword,
      signInWithPassword,
      logout,
      selectVault,
      createVault,
      releaseVault,
      refreshVault,
      addDocument,
      updateDocument,
      deleteDocument,
      downloadDocument,
      addMember,
      updateMember,
      removeMember,
      markNotificationRead,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (ctx === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return ctx;
}
