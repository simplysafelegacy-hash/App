import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useApp } from "@/context/AppContext";
import { planAllowsDocument, roleLabel, willLocationLabel } from "@/lib/permissions";
import { RoleBadge, isVaultIdentityHidden, vaultAccessLabel, vaultDisplayName, vaultOwnerName } from "@/components/VaultSwitcher";
import type { DocumentLocationType, DocumentType, VaultDocument, VaultSummary, Will } from "@/lib/types";
import { FileText, Lock, Pencil, Plus, Upload, Unlock, X } from "lucide-react";

const DOCUMENT_LOCATIONS: { value: DocumentLocationType; label: string }[] = [
  { value: "home_safe", label: "Home safe" },
  { value: "bank_safety_deposit", label: "Bank safety deposit box" },
  { value: "attorney_office", label: "Attorney's office" },
  { value: "other", label: "Other" },
];

const DOCUMENT_CONFIG: Record<
  DocumentType,
  {
    title: string;
    prompt: string;
    empty: string;
    addLabel: string;
    release: string;
    permission: string;
  }
> = {
  will: {
    title: "Will",
    prompt: "Do you have a will?",
    empty: "You haven't recorded a will yet.",
    addLabel: "Record your will",
    release:
      "Owner release anytime. After death: death certificate plus license for manual name and birthday match.",
    permission: "Successor",
  },
  power_of_attorney: {
    title: "Power of attorney",
    prompt: "Do you have a power of attorney?",
    empty: "You haven't recorded a power of attorney yet.",
    addLabel: "Record power of attorney",
    release:
      "Owner release anytime. After incapacity: usually two physician certifications.",
    permission: "Power of Attorney Agent, now or after incapacitated",
  },
  health_care_directive: {
    title: "Health care directive",
    prompt: "Do you have a health care directive?",
    empty: "You haven't recorded a health care directive yet.",
    addLabel: "Record health care directive",
    release:
      "Owner release anytime. After incapacity: usually two physician certifications.",
    permission: "Health Care Proxy, now or after incapacitated",
  },
};

const DOCUMENT_ORDER: DocumentType[] = [
  "will",
  "power_of_attorney",
  "health_care_directive",
];

export default function Dashboard() {
  const {
    vault,
    vaults,
    isAuthenticated,
    currentUser,
    permissions,
    currentVaultSummary,
    releaseVault,
    loading,
    refreshVault,
    userOwnsVault,
  } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    // Truly empty account → send to create-vault. Users who only have
    // *invited* vaults (no owned one) stay here and see the
    // "create your own vault" banner instead.
    if (!vault && vaults.length === 0) navigate("/create-vault");
  }, [isAuthenticated, vault, vaults.length, loading, navigate]);

  // After Stripe Checkout returns the user lands on /dashboard?subscription=success.
  // Refresh the vault & user so the new subscription state shows up.
  useEffect(() => {
    if (searchParams.get("subscription") === "success") {
      refreshVault().catch(() => {});
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("subscription");
          next.delete("session_id");
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams, refreshVault]);

  if (!vault || !currentVaultSummary) return null;

  if (permissions.isSealed) {
    return (
      <SealedAccessView
        vaultName={vaultDisplayName(currentVaultSummary)}
        ownerName={vaultOwnerName(currentVaultSummary)}
        identityHidden={isVaultIdentityHidden(currentVaultSummary)}
        vaultSummary={currentVaultSummary}
        releaseDocuments={releaseRequestDocumentsForSummary(currentVaultSummary)}
      />
    );
  }

  const memberCount = vault.members.filter((m) => m.role !== "owner").length;
  const firstName = (currentUser?.name || vault.ownerName).split(" ")[0];
  const dashboardDocuments = documentsForVault(
    vault.documents,
    vault.will,
    permissions.canModify,
  );
  const planLimits = currentUser?.planLimits;
  const releasedDocuments = currentVaultSummary.releasedDocuments ?? [];
  const releaseRequestDocuments = releaseRequestDocumentsForSummary(currentVaultSummary);
  const releaseRequestDocumentTypes = new Set(releaseRequestDocuments);
  const dashboardDocumentTypes = new Set(dashboardDocuments.map((document) => document.type));
  const extraReleaseDocuments = releaseRequestDocuments.filter(
    (documentType) => !dashboardDocumentTypes.has(documentType),
  );

  return (
    <Layout>
      <div className="container py-7 md:py-10 max-w-4xl">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-7">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <RoleBadge
                role={currentVaultSummary.role}
                label={vaultAccessLabel(currentVaultSummary)}
              />
              {vault.releasedAt && (
                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-accent/20 text-foreground">
                  Released
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold">
              {permissions.isOwner
                ? `Welcome, ${firstName}`
                : `${vault.ownerName}'s vault`}
            </h1>
            <p className="mt-2 text-base text-muted-foreground max-w-xl">
              {permissions.isOwner
                ? "Your documents, who can see them, and where they're kept."
                : permissions.isSteward
                  ? "You can see the vault documents and where they're kept."
                  : "Access has been released."}
            </p>
          </div>
          {permissions.canModify && (
            <ReleaseButton released={!!vault.releasedAt} onToggle={releaseVault} />
          )}
        </header>

        {!userOwnsVault && <CreateOwnVaultBanner />}

        {permissions.isOwner && currentUser && (
          <SubscriptionStrip user={currentUser} />
        )}

        <div className="space-y-5">
          {dashboardDocuments.map((document) => (
            <DocumentCard
              key={document.type}
              document={document}
              canEdit={
                permissions.canModify && planAllowsDocument(planLimits, document.type)
              }
              lockedMessage={
                permissions.canModify && !planAllowsDocument(planLimits, document.type)
                  ? `${planLimits?.name ?? "Your current"} plan does not include ${DOCUMENT_CONFIG[document.type].title.toLowerCase()}.`
                  : undefined
              }
              releasedByReview={releasedDocuments.includes(document.type)}
              canSubmitRelease={releaseRequestDocumentTypes.has(document.type)}
              designation={designationForDocument(currentVaultSummary, document.type)}
            />
          ))}
          {extraReleaseDocuments.length > 0 && (
            <ReleaseAccessCard
              documentTypes={extraReleaseDocuments}
              vaultSummary={currentVaultSummary}
            />
          )}
        </div>

        <div className="h-8" />

        <PeopleCard
          memberCount={memberCount}
          released={!!vault.releasedAt}
          canEdit={permissions.canModify}
          maxAuthorizedPeople={planLimits?.maxAuthorizedPeople}
        />

        {permissions.isOwner && vault.emergencyContactName && (
          <>
            <div className="h-8" />
            <EmergencyCard
              name={vault.emergencyContactName}
              phone={vault.emergencyContactPhone}
            />
          </>
        )}
      </div>
    </Layout>
  );
}

function CreateOwnVaultBanner() {
  const navigate = useNavigate();
  return (
    <div className="card-surface p-4 mb-7 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/30">
      <div>
        <p className="text-base font-medium text-foreground">
          You don't have your own vault yet
        </p>
        <p className="text-sm text-muted-foreground">
          Create one to record your will and choose who can see it.
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate("/create-vault")}
        className="btn-primary !min-h-[40px] !text-sm shrink-0"
      >
        <Plus size={16} strokeWidth={1.75} />
        Create your vault
      </button>
    </div>
  );
}

function SubscriptionStrip({
  user,
}: {
  user: {
    subscriptionStatus?: string | null;
    subscriptionPlan?: string | null;
    currentPeriodEnd?: string | null;
    planLimits?: { name: string; planCode: string } | null;
  };
}) {
  const { openCustomerPortal } = useApp();
  const status = user.subscriptionStatus;
  const plan = user.subscriptionPlan;

  if (!status && user.planLimits?.planCode !== "free") {
    return (
    <div className="card-surface p-4 mb-7 flex items-center justify-between gap-4 bg-secondary/30">
        <div>
          <p className="text-base font-medium">No active plan</p>
          <p className="text-sm text-muted-foreground">
            Pick a plan to continue using Simply Safe Legacy.
          </p>
        </div>
        <Link to="/plans" className="btn-primary !min-h-[40px] !text-sm">
          See plans
        </Link>
      </div>
    );
  }

  const renews = user.currentPeriodEnd
    ? new Date(user.currentPeriodEnd).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="card-surface p-4 mb-7 flex items-center justify-between gap-4">
      <div>
        <p className="text-base font-medium capitalize">
          {user.planLimits?.name ?? plan ?? "Active"} plan
          {status && (
            <span className="text-muted-foreground font-normal">
              {" · "}
              {status === "trialing" ? "Trial" : status}
            </span>
          )}
        </p>
        {renews && (
          <p className="text-sm text-muted-foreground">
            {status === "canceled" ? "Ends" : "Renews"} {renews}
          </p>
        )}
      </div>
      {user.planLimits?.planCode === "free" ? (
        <Link to="/plans" className="btn-primary !min-h-[40px] !text-sm">
          See plans
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => openCustomerPortal().catch(() => {})}
          className="btn-secondary !min-h-[40px] !text-sm"
        >
          Manage
        </button>
      )}
    </div>
  );
}

function DocumentCard({
  document,
  canEdit,
  lockedMessage,
  releasedByReview,
  canSubmitRelease,
  designation,
}: {
  document: VaultDocument;
  canEdit: boolean;
  lockedMessage?: string;
  releasedByReview: boolean;
  canSubmitRelease: boolean;
  designation?: string | null;
}) {
  const { resealDocument, updateDocument } = useApp();
  const config = DOCUMENT_CONFIG[document.type];
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    hasDocument: document.hasDocument,
    locationType: document.locationType || "",
    locationAddress: document.locationAddress,
    locationDescription: document.locationDescription,
  });

  // Reset draft if vault data updates underneath us.
  useEffect(() => {
    setDraft({
      hasDocument: document.hasDocument,
      locationType: document.locationType || "",
      locationAddress: document.locationAddress,
      locationDescription: document.locationDescription,
    });
  }, [document]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDocument(document.type, {
        hasDocument: draft.hasDocument,
        locationType: draft.hasDocument ? draft.locationType : "",
        locationAddress: draft.hasDocument ? draft.locationAddress : "",
        locationDescription: draft.hasDocument ? draft.locationDescription : "",
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card-surface p-5 md:p-6">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">{config.title}</h2>
          {releasedByReview && (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-accent/20 text-foreground">
              Released by review
            </span>
          )}
        </div>
        {canEdit && !editing && (
          <div className="flex items-center gap-2">
            {releasedByReview && (
              <ResealDocumentButton
                documentTitle={config.title}
                onReseal={() => resealDocument(document.type)}
              />
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-secondary !min-h-[36px] !text-sm"
            >
              <Pencil size={14} strokeWidth={1.75} />
              Edit
            </button>
          </div>
        )}
      </div>

      {!editing ? (
        document.hasDocument ? (
          <dl className="space-y-3">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Status</dt>
              <dd className="text-sm text-foreground">
                Yes — recorded
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Where it's kept
              </dt>
              <dd className="text-sm text-foreground">
                {willLocationLabel[document.locationType] || document.locationType || "—"}
              </dd>
            </div>
            {document.locationAddress && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Address
                </dt>
                <dd className="text-sm text-foreground">
                  {document.locationAddress}
                </dd>
              </div>
            )}
            {document.locationDescription && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Exact location
                </dt>
                <dd className="text-sm text-foreground">
                  {document.locationDescription}
                </dd>
              </div>
            )}
            {canEdit && (
              <>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Release
                  </dt>
                  <dd className="text-sm text-foreground">{config.release}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Permission
                  </dt>
                  <dd className="text-sm text-foreground">{config.permission}</dd>
                </div>
              </>
            )}
            {canSubmitRelease && (
              <ReleaseRequestForm documentType={document.type} designation={designation} />
            )}
          </dl>
        ) : (
          <div>
            <p className="text-muted-foreground mb-4">
              {canSubmitRelease
                ? `${config.title} details are sealed until release is approved.`
                : canEdit || lockedMessage
                ? config.empty
                : `${config.title} details are not available yet.`}
            </p>
            {lockedMessage && (
              <p className="text-sm text-muted-foreground mb-4">
                {lockedMessage}
              </p>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="btn-primary"
              >
                <Plus size={18} strokeWidth={1.75} />
                {config.addLabel}
              </button>
            )}
            {canSubmitRelease && (
              <ReleaseRequestForm documentType={document.type} designation={designation} />
            )}
          </div>
        )
      ) : (
        <form onSubmit={onSave} className="space-y-5">
          <fieldset>
            <legend className="field-label mb-3">
              {config.prompt}
            </legend>
            <div className="flex gap-2">
              <ToggleOption
                checked={draft.hasDocument}
                onClick={() => setDraft((d) => ({ ...d, hasDocument: true }))}
                label="Yes"
              />
              <ToggleOption
                checked={!draft.hasDocument}
                onClick={() => setDraft((d) => ({ ...d, hasDocument: false }))}
                label="Not yet"
              />
            </div>
          </fieldset>

          {draft.hasDocument && (
            <>
              <div>
                <label htmlFor="locationType" className="field-label">
                  Where is the original kept?
                </label>
                <select
                  id="locationType"
                  required
                  value={draft.locationType}
                  onChange={(e) =>
                    setDraft({ ...draft, locationType: e.target.value })
                  }
                  className="field"
                >
                  <option value="" disabled>
                    Select a location…
                  </option>
                  {DOCUMENT_LOCATIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="locationAddress" className="field-label">
                  Address or branch
                </label>
                <input
                  id="locationAddress"
                  type="text"
                  placeholder="e.g. 14 Oak Ridge Drive"
                  value={draft.locationAddress}
                  onChange={(e) =>
                    setDraft({ ...draft, locationAddress: e.target.value })
                  }
                  className="field"
                />
              </div>

              <div>
                <label htmlFor="locationDescription" className="field-label">
                  Exact location
                </label>
                <textarea
                  id="locationDescription"
                  placeholder="e.g. Top shelf of the black fireproof safe"
                  rows={3}
                  value={draft.locationDescription}
                  onChange={(e) =>
                    setDraft({ ...draft, locationDescription: e.target.value })
                  }
                  className="field resize-none"
                />
                <p className="field-hint">
                  Help whoever's looking for this find it without a search.
                </p>
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="btn-secondary"
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function ReleaseRequestForm({
  documentType,
  designation,
}: {
  documentType: DocumentType;
  designation?: string | null;
}) {
  const { submitReleaseRequest } = useApp();
  const inputId = `release-files-${documentType}`;
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const reason = documentType === "will" ? "death" : "incapacitated";
  const label =
    documentType === "will"
      ? "Submit death certificate and license"
      : "Submit physician certifications";

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (files.length === 0) return;
    setSaving(true);
    try {
      await submitReleaseRequest({
        documentType,
        releaseReason: reason,
        files,
      });
      setSubmitted(true);
      setFiles([]);
    } finally {
      setSaving(false);
    }
  };
  const onFilesSelected = (selected: FileList | null) => {
    setSubmitted(false);
    setFiles(Array.from(selected ?? []).slice(0, 2));
  };
  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index));
  };

  return (
    <form onSubmit={onSubmit} className="mt-5 border-t border-border pt-5 space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">
          {DOCUMENT_CONFIG[documentType].title}: {label}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Upload up to two images or PDFs for admin review.
        </p>
        {designation && (
          <p className="text-sm text-foreground mt-2">
            Your designation: {designation}
          </p>
        )}
      </div>

      <label
        htmlFor={inputId}
        className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border border-dashed border-border bg-secondary/20 px-4 py-4 cursor-pointer hover:bg-secondary/35 transition-colors"
      >
        <span className="h-10 w-10 rounded-md bg-background border border-border inline-flex items-center justify-center text-muted-foreground shrink-0">
          <Upload size={18} strokeWidth={1.75} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">
            Choose proof files
          </span>
          <span className="block text-sm text-muted-foreground">
            JPG, PNG, or PDF. Maximum 2 files.
          </span>
        </span>
        <span className="sm:ml-auto btn-secondary !min-h-[36px] !text-sm pointer-events-none">
          Browse
        </span>
      </label>
      <input
        id={inputId}
        type="file"
        multiple
        accept="image/*,.pdf"
        onChange={(event) => {
          onFilesSelected(event.target.files);
          event.currentTarget.value = "";
        }}
        className="sr-only"
      />

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              <FileText size={16} strokeWidth={1.75} className="text-muted-foreground shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground truncate">
                  {file.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="p-1.5 text-muted-foreground hover:text-destructive rounded-md transition-colors"
                aria-label={`Remove ${file.name}`}
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          type="submit"
          disabled={saving || files.length === 0}
          className="btn-primary !min-h-[40px] !text-sm"
        >
          {saving ? "Uploading..." : "Submit for review"}
        </button>
        {submitted && (
          <span className="text-sm text-muted-foreground">
            Submitted for admin review.
          </span>
        )}
      </div>
    </form>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ReleaseAccessCard({
  documentTypes,
  vaultSummary,
}: {
  documentTypes: DocumentType[];
  vaultSummary: VaultSummary;
}) {
  return (
    <section className="card-surface p-5 md:p-6">
      <h2 className="text-xl font-semibold mb-2">Request another release</h2>
      <p className="text-muted-foreground mb-5">
        You have another delayed permission on this vault. Submit proof for
        admin review to release that document section.
      </p>
      <div className="space-y-5">
        {documentTypes.map((documentType) => (
          <ReleaseRequestForm
            key={documentType}
            documentType={documentType}
            designation={designationForDocument(vaultSummary, documentType)}
          />
        ))}
      </div>
    </section>
  );
}

function ToggleOption({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-4 py-3 rounded-md border text-base font-medium transition-colors ${
        checked
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground border-border hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}

function PeopleCard({
  memberCount,
  released,
  canEdit,
  maxAuthorizedPeople,
}: {
  memberCount: number;
  released: boolean;
  canEdit: boolean;
  maxAuthorizedPeople?: number;
}) {
  return (
    <section className="card-surface p-5 md:p-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xl font-semibold">Who has access</h2>
        {canEdit && (
          <Link to="/members" className="link text-sm">
            Manage people
          </Link>
        )}
      </div>
      <p className="text-muted-foreground">
        {memberCount === 0
          ? "Nobody else can see this vault yet."
          : memberCount === 1
            ? "1 person has been named."
            : `${memberCount} people have been named.`}{" "}
        Permissions can now be specific to the will, power of attorney, or
        health care directive. Delayed permissions are{" "}
        {released ? "now available." : "sealed until you release the vault."}
        {canEdit && typeof maxAuthorizedPeople === "number" && (
          <>
            {" "}
            Your plan allows {maxAuthorizedPeople} authorized{" "}
            {maxAuthorizedPeople === 1 ? "person" : "people"}.
          </>
        )}
      </p>
    </section>
  );
}

function EmergencyCard({ name, phone }: { name: string; phone: string }) {
  return (
    <section className="card-surface p-5 md:p-6">
      <h2 className="text-lg font-semibold mb-2">Emergency contact</h2>
      <p className="text-sm font-medium">{name}</p>
      <p className="text-muted-foreground tnum">{phone}</p>
    </section>
  );
}

function ReleaseButton({
  released,
  onToggle,
}: {
  released: boolean;
  onToggle: (next: boolean) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button onClick={() => setConfirming(true)} className="btn-secondary">
        <Unlock size={16} strokeWidth={1.75} />
        {released ? "Re-seal vault" : "Release vault"}
      </button>
      {confirming && (
        <div
          className="fixed inset-0 z-50 bg-foreground/30 flex items-center justify-center p-4"
          onClick={() => setConfirming(false)}
        >
          <div
            className="card-surface max-w-md w-full p-6 bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold mb-3">
              {released ? "Re-seal this vault?" : "Release this vault?"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {released
                ? "Delayed permissions will lose access until you release the vault again. Any document releases approved by admin review will also be sealed."
                : "Successors will gain immediate access. Stewards already had access."}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirming(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onToggle(!released);
                  setConfirming(false);
                }}
                className="btn-primary"
              >
                {released ? "Re-seal" : "Release"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResealDocumentButton({
  documentTitle,
  onReseal,
}: {
  documentTitle: string;
  onReseal: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="btn-secondary !min-h-[36px] !text-sm"
      >
        <Lock size={14} strokeWidth={1.75} />
        Re-seal
      </button>
      {confirming && (
        <div
          className="fixed inset-0 z-50 bg-foreground/30 flex items-center justify-center p-4"
          onClick={() => setConfirming(false)}
        >
          <div
            className="card-surface max-w-md w-full p-6 bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold mb-3">
              Re-seal {documentTitle.toLowerCase()}?
            </h3>
            <p className="text-muted-foreground mb-6">
              People with delayed access to this document will lose access until
              another release is approved or the vault owner releases the vault.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirming(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onReseal();
                  setConfirming(false);
                }}
                className="btn-primary"
              >
                Re-seal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SealedAccessView({
  vaultName,
  ownerName,
  identityHidden,
  vaultSummary,
  releaseDocuments,
}: {
  vaultName: string;
  ownerName: string;
  identityHidden: boolean;
  vaultSummary: VaultSummary;
  releaseDocuments: DocumentType[];
}) {
  const documents = releaseDocuments;
  return (
    <Layout>
      <div className="container py-20 md:py-32 max-w-xl text-center">
        <h1 className="text-2xl md:text-3xl font-semibold mb-4">
          A vault held in trust
        </h1>
        {!identityHidden && (
          <p className="text-base text-muted-foreground mb-3">
            {vaultName} is being kept by {ownerName}.
          </p>
        )}
        <p className="text-muted-foreground">
          Access to this vault is sealed. When release is approved, document
          details will appear here and you'll be notified at that time.
          {documents.length > 0 ? " You can submit proof for review below." : ""}
        </p>
        {documents.length > 0 && (
          <div className="mt-8 text-left">
            <div className="space-y-5">
              {documents.map((documentType) => (
                <ReleaseRequestForm
                  key={documentType}
                  documentType={documentType}
                  designation={designationForDocument(vaultSummary, documentType)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function releaseRequestDocumentsForSummary(summary: VaultSummary): DocumentType[] {
  if (summary.role === "owner") return [];
  const vaultReleased = Boolean(summary.releasedAt);
  const releasedDocuments = summary.releasedDocuments ?? [];
  const recordedDocuments = summary.recordedDocuments ?? [];
  if (recordedDocuments.length) {
    return recordedDocuments.filter(
      (documentType) =>
        !vaultReleased && !releasedDocuments.includes(documentType),
    );
  }
  const permissions = summary.permissions?.length
    ? summary.permissions
    : [permissionForSummaryRole(summary)];
  const out: DocumentType[] = [];

  for (const permission of permissions) {
    if (!permission) continue;
    if (permission.accessTiming === "now") continue;
    if (vaultReleased || releasedDocuments.includes(permission.documentType)) continue;
    if (!out.includes(permission.documentType)) out.push(permission.documentType);
  }
  return out;
}

function designationForDocument(summary: VaultSummary, documentType: DocumentType) {
  const permission = summary.permissions?.find(
    (p) => p.documentType === documentType,
  );
  if (!permission) return null;
  if (permission.hidden) {
    return null;
  }
  return roleLabel[permission.permissionRole];
}

function permissionForSummaryRole(summary: VaultSummary) {
  const documentType = releaseDocumentForRole(summary.role);
  if (summary.role === "owner" || summary.role === "steward") return null;
  return {
    documentType,
    permissionRole: summary.role,
    accessTiming: summary.accessTiming ?? (summary.role === "successor" ? "after_death" : "incapacitated"),
  };
}

function releaseDocumentForRole(role: keyof typeof roleLabel): DocumentType {
  if (role === "poa_agent") return "power_of_attorney";
  if (role === "health_care_proxy") return "health_care_directive";
  return "will";
}

function documentsForVault(
  documents: VaultDocument[] | undefined,
  will: Will,
  includeAll: boolean,
): VaultDocument[] {
  const byType = new Map((documents ?? []).map((document) => [document.type, document]));
  if (!includeAll) {
    return documents ?? [];
  }
  if (!byType.has("will")) {
    byType.set("will", {
      type: "will",
      hasDocument: will.hasWill,
      locationType: will.locationType,
      locationAddress: will.locationAddress,
      locationDescription: will.locationDescription,
      updatedAt: will.updatedAt,
    });
  }
  return DOCUMENT_ORDER.map(
    (type) =>
      byType.get(type) ?? {
        type,
        hasDocument: false,
        locationType: "",
        locationAddress: "",
        locationDescription: "",
      },
  );
}
