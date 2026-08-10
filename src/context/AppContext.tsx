import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import {
  Notification,
  AccessTiming,
  DocumentType,
  MemberPermission,
  ReleaseRequest,
  FuneralWishes,
  SubscriptionPlan,
  User,
  Vault,
  VaultAttachment,
  VaultDocument,
  VaultEntry,
  VaultMember,
  VaultRole,
  VaultSection,
  VaultSummary,
  Will,
} from "@/lib/types";
import { api, type EntryInput } from "@/lib/api";
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
  vaults: VaultSummary[];
  currentVaultId: string | null;
  currentVaultSummary: VaultSummary | null;
  vault: Vault | null;
  permissions: Permissions;
  // True if any vault in `vaults` has role === "owner" — i.e. the user
  // has their own vault. False for users who are only stewards or
  // successors on someone else's vault.
  userOwnsVault: boolean;

  notifications: Notification[];

  // Auth — Google OAuth and email/password live side by side.
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
  resealDocument: (type: DocumentType) => Promise<void>;
  refreshVault: () => Promise<void>;
  updateWill: (will: {
    hasWill: boolean;
    locationType?: string;
    locationAddress?: string;
    locationDescription?: string;
  }) => Promise<void>;
  updateDocument: (
    type: DocumentType,
    document: {
      hasDocument: boolean;
      locationType?: string;
      locationAddress?: string;
      locationDescription?: string;
    },
  ) => Promise<void>;
  submitReleaseRequest: (data: {
    documentType: DocumentType;
    releaseReason: "death" | "incapacitated";
    note?: string;
    files: File[];
  }) => Promise<ReleaseRequest | null>;

  // Document copies (uploaded files attached to a section).
  uploadAttachment: (
    section: VaultSection,
    file: File,
  ) => Promise<VaultAttachment | null>;
  removeAttachment: (id: string) => Promise<void>;
  downloadAttachment: (attachment: VaultAttachment) => Promise<void>;

  // List entries (personal property, non-probate assets, contacts).
  addEntry: (data: EntryInput) => Promise<VaultEntry | null>;
  updateEntry: (id: string, data: EntryInput) => Promise<VaultEntry | null>;
  removeEntry: (id: string) => Promise<void>;

  // Funeral & burial wishes (a single record per vault).
  updateFuneralWishes: (data: {
    hasFuneral: boolean;
    disposition?: string;
    serviceWishes?: string;
    serviceLocation?: string;
    officiant?: string;
    readingsMusic?: string;
    prepaidProvider?: string;
    notes?: string;
  }) => Promise<void>;

  // Members
  addMember: (m: {
    name: string;
    email: string;
    role: VaultRole;
    dateOfBirth?: string;
    accessTiming?: AccessTiming;
    permissions?: MemberPermission[];
  }) => Promise<VaultMember | null>;
  updateMember: (
    id: string,
    updates: Partial<Pick<VaultMember, "name" | "role" | "permissions">>,
  ) => Promise<void>;
  removeMember: (id: string) => Promise<void>;

  // Billing — both methods redirect away to a Stripe-hosted page on
  // success. They throw if the backend is misconfigured.
  startCheckout: (plan: SubscriptionPlan) => Promise<void>;
  openCustomerPortal: () => Promise<void>;

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
  const userOwnsVault = useMemo(
    () => vaults.some((v) => v.role === "owner"),
    [vaults],
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
    const initial = exists ? stored : (list[0]?.id ?? null);
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

  // afterAuth runs the post-token bookkeeping shared by every sign-in path.
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
          will: { hasWill: false, locationType: "", locationAddress: "", locationDescription: "" },
          documents: emptyDocuments(),
          attachments: [],
          entries: [],
          funeral: emptyFuneral(),
          members: [
            {
              id: `member-${Date.now()}`,
              userId: currentUser?.id ?? "",
              name: data.fullName,
              email: data.email,
              role: "owner",
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
          prev.map((s) =>
            s.id === vault.id
              ? {
                  ...s,
                  releasedAt,
                  releasedDocuments: released ? s.releasedDocuments : [],
                }
              : s,
          ),
        );
        return;
      }
      const res = await api.vault.release(released);
      setVault({ ...vault, releasedAt: res.releasedAt });
      setVaults((prev) =>
        prev.map((s) =>
          s.id === vault.id
            ? {
                ...s,
                releasedAt: res.releasedAt,
                releasedDocuments: released
                  ? s.releasedDocuments
                  : res.releasedDocuments ?? [],
              }
            : s,
        ),
      );
    },
    [vault],
  );

  const resealDocument = useCallback(
    async (type: DocumentType) => {
      if (!vault) return;
      if (!DEMO_MODE) await api.vault.resealDocument(type);
      setVaults((prev) =>
        prev.map((s) =>
          s.id === vault.id
            ? {
                ...s,
                releasedDocuments: (s.releasedDocuments ?? []).filter(
                  (documentType) => documentType !== type,
                ),
              }
            : s,
        ),
      );
    },
    [vault],
  );

  const updateWill = useCallback(
    async (data: {
      hasWill: boolean;
      locationType?: string;
      locationAddress?: string;
      locationDescription?: string;
    }) => {
      if (!vault) return;
      const next: Will = {
        hasWill: data.hasWill,
        locationType: (data.locationType ?? "") as Will["locationType"],
        locationAddress: data.locationAddress ?? "",
        locationDescription: data.locationDescription ?? "",
        updatedAt: new Date().toISOString(),
      };
      if (DEMO_MODE) {
        setVault({ ...vault, will: next });
        pushNotification({
          type: "will_updated",
          message: "Will details updated",
          vaultId: vault.id,
        });
        return;
      }
      const saved = await api.vault.updateWill(data);
      setVault({ ...vault, will: saved });
      pushNotification({
        type: "will_updated",
        message: "Will details updated",
        vaultId: vault.id,
      });
    },
    [vault, pushNotification],
  );

  const updateDocument = useCallback(
    async (
      type: DocumentType,
      data: {
        hasDocument: boolean;
        locationType?: string;
        locationAddress?: string;
        locationDescription?: string;
      },
    ) => {
      if (!vault) return;
      const next: VaultDocument = {
        type,
        hasDocument: data.hasDocument,
        locationType: (data.locationType ?? "") as VaultDocument["locationType"],
        locationAddress: data.locationAddress ?? "",
        locationDescription: data.locationDescription ?? "",
        updatedAt: new Date().toISOString(),
      };
      if (DEMO_MODE) {
        setVault({
          ...vault,
          will:
            type === "will"
              ? {
                  hasWill: next.hasDocument,
                  locationType: next.locationType,
                  locationAddress: next.locationAddress,
                  locationDescription: next.locationDescription,
                  updatedAt: next.updatedAt,
                }
              : vault.will,
          documents: upsertDocument(vault.documents, next),
        });
        pushNotification({
          type: "document_updated",
          message: "Document details updated",
          vaultId: vault.id,
        });
        return;
      }
      const saved = await api.vault.updateDocument(type, data);
      setVault({
        ...vault,
        will:
          type === "will"
            ? {
                hasWill: saved.hasDocument,
                locationType: saved.locationType,
                locationAddress: saved.locationAddress,
                locationDescription: saved.locationDescription,
                updatedAt: saved.updatedAt,
              }
            : vault.will,
        documents: upsertDocument(vault.documents, saved),
      });
      pushNotification({
        type: "document_updated",
        message: "Document details updated",
        vaultId: vault.id,
      });
    },
    [vault, pushNotification],
  );

  const addMember = useCallback(
    async (m: {
      name: string;
      email: string;
      role: VaultRole;
      dateOfBirth?: string;
      accessTiming?: AccessTiming;
      permissions?: MemberPermission[];
    }): Promise<VaultMember | null> => {
      if (!vault) return null;
      const created: VaultMember = DEMO_MODE
        ? {
            id: `member-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            userId: "",
            name: m.name,
            email: m.email,
            role: m.role,
            dateOfBirth: m.dateOfBirth ?? "",
            accessTiming: m.accessTiming ?? defaultAccessTiming(m.role),
            permissions: m.permissions ?? defaultPermissionsForRole(m.role, m.accessTiming),
          }
        : await api.members.create(m);
      setVault({ ...vault, members: [...vault.members, created] });
      pushNotification({
        type: "member_added",
        message: `${created.name} added to the vault`,
        vaultId: vault.id,
      });
      return created;
    },
    [vault, pushNotification],
  );

  const updateMember = useCallback(
    async (
      id: string,
      updates: Partial<Pick<VaultMember, "name" | "role" | "permissions">>,
    ) => {
      if (!vault) return;
      const updated = DEMO_MODE
        ? null
        : await api.members.update(id, updates);
      setVault({
        ...vault,
        members: vault.members.map((m) =>
          m.id === id ? (updated ?? { ...m, ...updates }) : m,
        ),
      });
    },
    [vault],
  );

  const submitReleaseRequest = useCallback(
    async (data: {
      documentType: DocumentType;
      releaseReason: "death" | "incapacitated";
      note?: string;
      files: File[];
    }): Promise<ReleaseRequest | null> => {
      if (!vault) return null;
      if (DEMO_MODE) {
        return {
          id: `release-${Date.now()}`,
          vaultId: vault.id,
          requesterId: "",
          documentType: data.documentType,
          releaseReason: data.releaseReason,
          status: "pending",
          note: data.note ?? "",
          files: data.files.map((file, index) => ({
            id: `release-file-${Date.now()}-${index}`,
            fileName: file.name,
            contentType: file.type,
            fileSize: file.size,
            gcsObject: `${vault.id}/release-requests/demo/${file.name}`,
          })),
          createdAt: new Date().toISOString(),
        };
      }
      return api.releaseRequests.create(data);
    },
    [vault],
  );

  const uploadAttachment = useCallback(
    async (
      section: VaultSection,
      file: File,
    ): Promise<VaultAttachment | null> => {
      if (!vault) return null;
      const created: VaultAttachment = DEMO_MODE
        ? {
            id: `attachment-${Date.now()}`,
            section,
            entryId: null,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            fileSize: file.size,
            createdAt: new Date().toISOString(),
          }
        : await api.attachments.upload(section, file);
      setVault({
        ...vault,
        attachments: [created, ...(vault.attachments ?? [])],
      });
      pushNotification({
        type: "document_updated",
        message: `Copy uploaded for ${section.replace(/_/g, " ")}`,
        vaultId: vault.id,
      });
      return created;
    },
    [vault, pushNotification],
  );

  const removeAttachment = useCallback(
    async (id: string) => {
      if (!vault) return;
      if (!DEMO_MODE) await api.attachments.remove(id);
      setVault({
        ...vault,
        attachments: (vault.attachments ?? []).filter((a) => a.id !== id),
      });
    },
    [vault],
  );

  const downloadAttachment = useCallback(
    async (attachment: VaultAttachment) => {
      if (DEMO_MODE) {
        window.alert(
          `Demo mode: would download "${attachment.fileName}".`,
        );
        return;
      }
      const blob = await api.attachments.download(attachment.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
    [],
  );

  const addEntry = useCallback(
    async (data: EntryInput): Promise<VaultEntry | null> => {
      if (!vault) return null;
      const created: VaultEntry = DEMO_MODE
        ? {
            id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            section: data.section,
            title: data.title,
            details: data.details ?? {},
            sortOrder: data.sortOrder ?? vault.entries.length,
            beneficiaries: (data.beneficiaries ?? [])
              .filter((b) => b.name.trim() !== "")
              .map((b, i) => ({ ...b, id: `ben-${Date.now()}-${i}` })),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : await api.entries.create(data);
      setVault({ ...vault, entries: [...vault.entries, created] });
      return created;
    },
    [vault],
  );

  const updateEntry = useCallback(
    async (id: string, data: EntryInput): Promise<VaultEntry | null> => {
      if (!vault) return null;
      const existing = vault.entries.find((e) => e.id === id) ?? null;
      const updated: VaultEntry = DEMO_MODE
        ? {
            id,
            section: data.section,
            title: data.title,
            details: data.details ?? {},
            sortOrder: data.sortOrder ?? existing?.sortOrder ?? 0,
            beneficiaries: (data.beneficiaries ?? [])
              .filter((b) => b.name.trim() !== "")
              .map((b, i) => ({ ...b, id: b.id ?? `ben-${Date.now()}-${i}` })),
            createdAt: existing?.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : await api.entries.update(id, data);
      setVault({
        ...vault,
        entries: vault.entries.map((e) => (e.id === id ? updated : e)),
      });
      return updated;
    },
    [vault],
  );

  const removeEntry = useCallback(
    async (id: string) => {
      if (!vault) return;
      if (!DEMO_MODE) await api.entries.remove(id);
      setVault({
        ...vault,
        entries: vault.entries.filter((e) => e.id !== id),
      });
    },
    [vault],
  );

  const updateFuneralWishes = useCallback(
    async (data: {
      hasFuneral: boolean;
      disposition?: string;
      serviceWishes?: string;
      serviceLocation?: string;
      officiant?: string;
      readingsMusic?: string;
      prepaidProvider?: string;
      notes?: string;
    }) => {
      if (!vault) return;
      const next: FuneralWishes = {
        hasFuneral: data.hasFuneral,
        disposition: (data.hasFuneral ? data.disposition ?? "" : "") as FuneralWishes["disposition"],
        serviceWishes: data.hasFuneral ? data.serviceWishes ?? "" : "",
        serviceLocation: data.hasFuneral ? data.serviceLocation ?? "" : "",
        officiant: data.hasFuneral ? data.officiant ?? "" : "",
        readingsMusic: data.hasFuneral ? data.readingsMusic ?? "" : "",
        prepaidProvider: data.hasFuneral ? data.prepaidProvider ?? "" : "",
        notes: data.hasFuneral ? data.notes ?? "" : "",
        updatedAt: data.hasFuneral ? new Date().toISOString() : null,
      };
      const saved = DEMO_MODE ? next : await api.funeral.update(data);
      setVault({ ...vault, funeral: saved });
      pushNotification({
        type: "document_updated",
        message: "Funeral wishes updated",
        vaultId: vault.id,
      });
    },
    [vault, pushNotification],
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

  const startCheckout = useCallback(async (plan: SubscriptionPlan) => {
    if (DEMO_MODE) {
      window.alert(
        `Demo mode: would start Stripe Checkout for the ${plan} plan.`,
      );
      return;
    }
    const { url } = await api.billing.checkout(plan);
    window.location.assign(url);
  }, []);

  const openCustomerPortal = useCallback(async () => {
    if (DEMO_MODE) {
      window.alert("Demo mode: would open the Stripe Customer Portal.");
      return;
    }
    const { url } = await api.billing.portal();
    window.location.assign(url);
  }, []);

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
      userOwnsVault,
      notifications,
      signInWithGoogle,
      signUpWithPassword,
      signInWithPassword,
      logout,
      selectVault,
      createVault,
      releaseVault,
      resealDocument,
      refreshVault,
      updateWill,
      updateDocument,
      submitReleaseRequest,
      uploadAttachment,
      removeAttachment,
      downloadAttachment,
      addEntry,
      updateEntry,
      removeEntry,
      updateFuneralWishes,
      addMember,
      updateMember,
      removeMember,
      startCheckout,
      openCustomerPortal,
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
      userOwnsVault,
      notifications,
      signInWithGoogle,
      signUpWithPassword,
      signInWithPassword,
      logout,
      selectVault,
      createVault,
      releaseVault,
      resealDocument,
      refreshVault,
      updateWill,
      updateDocument,
      submitReleaseRequest,
      uploadAttachment,
      removeAttachment,
      downloadAttachment,
      addEntry,
      updateEntry,
      removeEntry,
      updateFuneralWishes,
      addMember,
      updateMember,
      removeMember,
      startCheckout,
      openCustomerPortal,
      markNotificationRead,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

const documentTypes: DocumentType[] = [
  "will",
  "power_of_attorney",
  "health_care_directive",
];

function emptyDocuments(): VaultDocument[] {
  return documentTypes.map((type) => ({
    type,
    hasDocument: false,
    locationType: "",
    locationAddress: "",
    locationDescription: "",
  }));
}

function emptyFuneral(): FuneralWishes {
  return {
    hasFuneral: false,
    disposition: "",
    serviceWishes: "",
    serviceLocation: "",
    officiant: "",
    readingsMusic: "",
    prepaidProvider: "",
    notes: "",
  };
}

function upsertDocument(
  documents: VaultDocument[] | undefined,
  next: VaultDocument,
): VaultDocument[] {
  const existing = documents?.length ? documents : emptyDocuments();
  const found = existing.some((d) => d.type === next.type);
  if (!found) return [...existing, next];
  return existing.map((d) => (d.type === next.type ? next : d));
}

function defaultAccessTiming(role: VaultRole): AccessTiming {
  if (role === "successor") return "after_death";
  if (role === "poa_agent" || role === "health_care_proxy") return "incapacitated";
  return "now";
}

function defaultPermissionsForRole(
  role: VaultRole,
  timing?: AccessTiming,
): MemberPermission[] {
  if (role === "owner") return [];
  const documentType: DocumentType =
    role === "poa_agent"
      ? "power_of_attorney"
      : role === "health_care_proxy"
        ? "health_care_directive"
        : "will";
  return [
    {
      documentType,
      permissionRole: role,
      accessTiming: timing ?? defaultAccessTiming(role),
      hidden: false,
    },
  ];
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (ctx === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return ctx;
}
