import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useApp } from "@/context/AppContext";
import { planAllowsDocument, roleLabel, willLocationLabel } from "@/lib/permissions";
import { RoleBadge, isVaultIdentityHidden, vaultAccessLabel, vaultDisplayName, vaultOwnerName } from "@/components/VaultSwitcher";
import { ListSection } from "@/components/ListSection";
import { FuneralCard } from "@/components/FuneralCard";
import { StatusPill } from "@/components/StatusPill";
import { Zone } from "@/components/Zone";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { DocumentLocationType, DocumentType, ListSection as ListSectionKind, PlanLimits, ReleaseRequest, VaultAttachment, VaultDocument, VaultSummary, Will } from "@/lib/types";
import { ChevronRight, Download, FileText, Lock, Pencil, Plus, Trash2, Upload, Unlock, X } from "lucide-react";

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

const LIST_SECTIONS: ListSectionKind[] = [
  "personal_property",
  "non_probate",
  "contacts",
];

const MAX_RELEASE_REQUESTS_PER_DOCUMENT = 3;

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
    listReleaseRequests,
  } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [releaseRequests, setReleaseRequests] = useState<ReleaseRequest[]>([]);

  const vaultId = vault?.id ?? null;
  const refreshReleaseRequests = useCallback(() => {
    if (!vaultId) return;
    listReleaseRequests()
      .then(setReleaseRequests)
      .catch(() => setReleaseRequests([]));
  }, [vaultId, listReleaseRequests]);

  // Load the vault's release requests so recorded documents can show how many
  // proof submissions have been made and how many attempts remain.
  useEffect(() => {
    refreshReleaseRequests();
  }, [refreshReleaseRequests]);

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
        releaseRequests={releaseRequests}
        onReleaseRequestSubmitted={refreshReleaseRequests}
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

  const listSectionsToShow = LIST_SECTIONS.map((section) => {
    const sectionEntries = (vault.entries ?? []).filter((e) => e.section === section);
    const planAllows = planAllowsDocument(planLimits, section);
    // Owners see the section when their plan includes it (to add items) or when
    // it already holds items. Readers see it only when they were given entries —
    // the backend omits sections they can't read.
    const show = permissions.canModify
      ? planAllows || sectionEntries.length > 0
      : sectionEntries.length > 0;
    return { section, sectionEntries, planAllows, show };
  }).filter((s) => s.show);

  const funeralAllowed = planAllowsDocument(planLimits, "funeral");
  const showFuneral = permissions.canModify
    ? funeralAllowed || vault.funeral.hasFuneral
    : vault.funeral.hasFuneral;

  const readiness = permissions.isOwner
    ? computeReadiness(dashboardDocuments, planLimits, vault, showFuneral, funeralAllowed)
    : null;

  return (
    <Layout>
      <div className="container py-7 md:py-10 max-w-4xl">
        {/* ── Readiness header ─────────────────────────────────────── */}
        <section className="card-surface p-6 md:p-8 mb-9">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <RoleBadge
                  role={currentVaultSummary.role}
                  label={vaultAccessLabel(currentVaultSummary)}
                />
                {vault.releasedAt && (
                  <span className="inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full bg-accent/15 text-accent">
                    Released
                  </span>
                )}
              </div>
              <h1 className="text-3xl md:text-4xl font-semibold">
                {permissions.isOwner
                  ? `Welcome, ${firstName}`
                  : `${vault.ownerName}'s vault`}
              </h1>
              <p className="mt-2 text-lg text-muted-foreground max-w-xl">
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
          </div>

          {readiness && <ReadinessMeter readiness={readiness} />}
        </section>

        {!userOwnsVault && <CreateOwnVaultBanner />}

        {permissions.isOwner && currentUser && (
          <SubscriptionStrip user={currentUser} />
        )}

        <Zone title="Core documents">
          <div className="grid gap-5 sm:grid-cols-2">
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
                attachments={(vault.attachments ?? []).filter(
                  (a) => a.section === document.type,
                )}
                releaseRequests={releaseRequests.filter(
                  (rr) => rr.documentType === document.type,
                )}
                onReleaseRequestSubmitted={refreshReleaseRequests}
              />
            ))}
          </div>
          {extraReleaseDocuments.length > 0 && (
            <div className="mt-5">
              <ReleaseAccessCard
                documentTypes={extraReleaseDocuments}
                vaultSummary={currentVaultSummary}
                releaseRequests={releaseRequests}
                onReleaseRequestSubmitted={refreshReleaseRequests}
              />
            </div>
          )}
        </Zone>

        {(listSectionsToShow.length > 0 || showFuneral) && (
          <Zone title="Your lists">
            <div className="space-y-5">
              {listSectionsToShow.map(({ section, sectionEntries, planAllows }) => (
                <ListSection
                  key={section}
                  section={section}
                  entries={sectionEntries}
                  canEdit={permissions.canModify && planAllows}
                />
              ))}

              {showFuneral && (
                <FuneralCard
                  funeral={vault.funeral}
                  canEdit={permissions.canModify && funeralAllowed}
                  lockedMessage={
                    permissions.canModify && !funeralAllowed
                      ? `${planLimits?.name ?? "Your current"} plan does not include funeral wishes.`
                      : undefined
                  }
                />
              )}
            </div>
          </Zone>
        )}

        <Zone title="People &amp; access">
          <div className="space-y-5">
            <PeopleCard
              memberCount={memberCount}
              released={!!vault.releasedAt}
              canEdit={permissions.canModify}
              maxAuthorizedPeople={planLimits?.maxAuthorizedPeople}
            />

            {permissions.isOwner && vault.emergencyContactName && (
              <EmergencyCard
                name={vault.emergencyContactName}
                phone={vault.emergencyContactPhone}
              />
            )}
          </div>
        </Zone>
      </div>
    </Layout>
  );
}

/**
 * Vault readiness for the owner: how many of the essential sections are
 * recorded, and the single most useful next step. "Essentials" = the sections
 * the owner's plan actually includes (locked sections don't count against you).
 */
interface Readiness {
  done: number;
  total: number;
  nextLabel: string | null;
}

function computeReadiness(
  documents: VaultDocument[],
  planLimits: PlanLimits | null | undefined,
  vault: { funeral: { hasFuneral: boolean } },
  showFuneral: boolean,
  funeralAllowed: boolean,
): Readiness {
  const items: { done: boolean; label: string }[] = [];

  for (const doc of documents) {
    if (!planAllowsDocument(planLimits, doc.type)) continue;
    items.push({
      done: doc.hasDocument,
      label: DOCUMENT_CONFIG[doc.type].addLabel,
    });
  }
  if (showFuneral && funeralAllowed) {
    items.push({ done: vault.funeral.hasFuneral, label: "Record your funeral wishes" });
  }

  const done = items.filter((i) => i.done).length;
  const next = items.find((i) => !i.done);
  return { done, total: items.length, nextLabel: next?.label ?? null };
}

function ReadinessMeter({ readiness }: { readiness: Readiness }) {
  const { done, total, nextLabel } = readiness;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mt-6 grid gap-4">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-base font-medium">Vault readiness</span>
        <span
          className="flex-1 min-w-[160px] h-3.5 rounded-full bg-muted border border-border overflow-hidden"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Vault readiness"
        >
          <span
            className="block h-full rounded-full bg-status-done transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="text-base font-bold tnum whitespace-nowrap">
          {done} of {total} essentials
        </span>
      </div>

      {nextLabel && (
        <div className="flex items-center justify-between gap-4 rounded-lg border-2 border-accent/45 bg-accent/10 px-5 py-4">
          <span className="text-base md:text-lg">
            <strong className="font-bold">Next step:</strong>{" "}
            {nextLabel.charAt(0).toLowerCase() + nextLabel.slice(1)}.
          </span>
          <ChevronRight
            size={22}
            strokeWidth={2}
            className="text-foreground shrink-0"
            aria-hidden
          />
        </div>
      )}
    </div>
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
  attachments,
  releaseRequests,
  onReleaseRequestSubmitted,
}: {
  document: VaultDocument;
  canEdit: boolean;
  lockedMessage?: string;
  releasedByReview: boolean;
  canSubmitRelease: boolean;
  designation?: string | null;
  attachments: VaultAttachment[];
  releaseRequests: ReleaseRequest[];
  onReleaseRequestSubmitted: () => void;
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

  // Status pill: recorded documents show green "Recorded"; a review-released
  // document is flagged amber; otherwise it's a calm neutral "Not yet".
  const pill = document.hasDocument ? (
    <StatusPill kind="done">Recorded</StatusPill>
  ) : (
    <StatusPill kind="pending">Not yet</StatusPill>
  );

  return (
    <section className="card-surface p-6 md:p-7 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 className="text-xl font-semibold">{config.title}</h2>
        {!editing && (
          <div className="flex items-center gap-2 shrink-0">
            {releasedByReview ? <StatusPill kind="attention">Released by review</StatusPill> : pill}
          </div>
        )}
      </div>

      {canEdit && !editing && document.hasDocument && (
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-secondary !min-h-[40px] !text-sm"
          >
            <Pencil size={15} strokeWidth={1.75} />
            Edit
          </button>
          {releasedByReview && (
            <ResealDocumentButton
              documentTitle={config.title}
              onReseal={() => resealDocument(document.type)}
            />
          )}
        </div>
      )}

      {!editing ? (
        document.hasDocument ? (
          <div className="space-y-4">
            {/* Location is the hero — the thing a reader actually needs. */}
            <div>
              <p className="text-lg font-semibold text-foreground">
                {willLocationLabel[document.locationType] || document.locationType || "—"}
              </p>
              {document.locationAddress && (
                <p className="text-base text-muted-foreground mt-1">
                  {document.locationAddress}
                </p>
              )}
              {document.locationDescription && (
                <p className="text-base text-muted-foreground mt-1">
                  {document.locationDescription}
                </p>
              )}
            </div>

            {canEdit && (
              <Collapsible className="border-t border-border pt-3">
                <CollapsibleTrigger className="group inline-flex items-center gap-2 text-base font-semibold text-primary">
                  <ChevronRight
                    size={16}
                    strokeWidth={2}
                    className="transition-transform group-data-[state=open]:rotate-90"
                    aria-hidden
                  />
                  How this is released
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <dl className="mt-3 space-y-3">
                    <div>
                      <dt className="text-sm font-semibold text-muted-foreground">
                        Release
                      </dt>
                      <dd className="text-base text-foreground mt-0.5">{config.release}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-semibold text-muted-foreground">
                        Permission
                      </dt>
                      <dd className="text-base text-foreground mt-0.5">{config.permission}</dd>
                    </div>
                  </dl>
                </CollapsibleContent>
              </Collapsible>
            )}
            <ReleaseRequestsSummary requests={releaseRequests} />
            {canSubmitRelease && (
              <ReleaseRequestForm
                documentType={document.type}
                designation={designation}
                submissionsUsed={releaseRequests.length}
                onSubmitted={onReleaseRequestSubmitted}
              />
            )}
            <DocumentCopyBlock
              section={document.type}
              canEdit={canEdit}
              attachments={attachments}
            />
          </div>
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
                className="btn-primary self-start"
              >
                <Plus size={18} strokeWidth={1.75} />
                {config.addLabel}
              </button>
            )}
            <ReleaseRequestsSummary requests={releaseRequests} />
            {canSubmitRelease && (
              <ReleaseRequestForm
                documentType={document.type}
                designation={designation}
                submissionsUsed={releaseRequests.length}
                onSubmitted={onReleaseRequestSubmitted}
              />
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

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/**
 * The stored copy of a document. Owners can upload/replace/remove a copy;
 * everyone permitted to see the section can download it. The block only ever
 * renders inside a card the caller can already read, so its presence never
 * leaks a sealed document.
 */
function DocumentCopyBlock({
  section,
  canEdit,
  attachments,
}: {
  section: DocumentType;
  canEdit: boolean;
  attachments: VaultAttachment[];
}) {
  const { uploadAttachment, removeAttachment, downloadAttachment } = useApp();
  const inputId = `attachment-file-${section}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("That file is over 50 MB. Please upload a smaller copy.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await uploadAttachment(section, file);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async (attachment: VaultAttachment) => {
    setError(null);
    try {
      await downloadAttachment(attachment);
    } catch {
      setError("Download failed. Please try again.");
    }
  };

  const onRemove = async (attachment: VaultAttachment) => {
    if (!window.confirm(`Remove "${attachment.fileName}"?`)) return;
    setError(null);
    setBusy(true);
    try {
      await removeAttachment(attachment.id);
    } catch {
      setError("Could not remove the file. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Nothing to show: a non-owner viewer with no copy on file sees nothing.
  if (attachments.length === 0 && !canEdit) return null;

  return (
    <div className="pt-3 mt-1 border-t border-border/60">
      <p className="text-sm font-semibold text-muted-foreground mb-2">
        Copy on file
      </p>
      <div>
        {attachments.length > 0 ? (
          <ul className="space-y-2">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2"
              >
                <FileText size={18} strokeWidth={1.75} className="text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">
                    {attachment.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(attachment.fileSize)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDownload(attachment)}
                  className="btn-secondary !min-h-[32px] !px-2 !text-xs"
                  aria-label={`Download ${attachment.fileName}`}
                >
                  <Download size={14} strokeWidth={1.75} />
                  Download
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onRemove(attachment)}
                    disabled={busy}
                    className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    aria-label={`Remove ${attachment.fileName}`}
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No copy uploaded yet.
          </p>
        )}

        {canEdit && (
          <div className="mt-3">
            <input
              id={inputId}
              type="file"
              className="sr-only"
              onChange={onUpload}
              disabled={busy}
            />
            <label
              htmlFor={inputId}
              className={`btn-secondary !min-h-[36px] !text-sm cursor-pointer inline-flex ${
                busy ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <Upload size={14} strokeWidth={1.75} />
              {busy
                ? "Uploading…"
                : attachments.length > 0
                ? "Upload another copy"
                : "Upload a copy"}
            </label>
            <p className="field-hint">
              Stored privately. Only people you permit — at the time you set —
              can open it. Up to 50 MB.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
      </div>
    </div>
  );
}

const MAX_RELEASE_FILES = 3;

/**
 * Shows the release-request submissions made against a document so anyone with
 * access to the card (owner, steward, successor, agent) can see how many proofs
 * have been submitted and where they stand in admin review.
 */
function ReleaseRequestsSummary({ requests }: { requests: ReleaseRequest[] }) {
  if (requests.length === 0) return null;

  const pending = requests.filter((r) => r.status === "pending").length;
  const approved = requests.filter((r) => r.status === "approved").length;
  const rejected = requests.filter((r) => r.status === "rejected").length;
  const latest = requests.reduce((newest, r) =>
    new Date(r.createdAt) > new Date(newest.createdAt) ? r : newest,
  );

  const statusStyles: Record<ReleaseRequest["status"], string> = {
    pending: "bg-status-attention/15 text-status-attention",
    approved: "bg-status-done/15 text-status-done",
    rejected: "bg-destructive/10 text-destructive",
  };
  const statusLabel: Record<ReleaseRequest["status"], string> = {
    pending: "Under review",
    approved: "Approved",
    rejected: "Rejected",
  };

  return (
    <div className="mt-5 border-t border-border pt-5">
      <p className="text-sm font-semibold text-muted-foreground mb-2">
        Release submissions
      </p>
      <p className="text-base text-foreground">
        {requests.length}{" "}
        {requests.length === 1 ? "submission" : "submissions"} for admin review
        {pending > 0 && ` · ${pending} under review`}
        {approved > 0 && ` · ${approved} approved`}
        {rejected > 0 && ` · ${rejected} rejected`}
      </p>
      <ul className="mt-3 space-y-2">
        {requests
          .slice()
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          .map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-muted-foreground">
                {new Date(r.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                {" · "}
                {r.files.length} {r.files.length === 1 ? "file" : "files"}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${statusStyles[r.status]}`}
              >
                {statusLabel[r.status]}
              </span>
            </li>
          ))}
      </ul>
      {latest.status === "rejected" && latest.note && (
        <p className="mt-3 text-sm text-muted-foreground">
          Latest was rejected: {latest.note}
        </p>
      )}
    </div>
  );
}

function ReleaseRequestForm({
  documentType,
  designation,
  submissionsUsed,
  onSubmitted,
}: {
  documentType: DocumentType;
  designation?: string | null;
  submissionsUsed: number;
  onSubmitted: () => void;
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
  const attemptsLeft = Math.max(
    MAX_RELEASE_REQUESTS_PER_DOCUMENT - submissionsUsed,
    0,
  );
  const atLimit = attemptsLeft <= 0;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (files.length === 0 || atLimit) return;
    setSaving(true);
    try {
      await submitReleaseRequest({
        documentType,
        releaseReason: reason,
        files,
      });
      setSubmitted(true);
      setFiles([]);
      onSubmitted();
    } finally {
      setSaving(false);
    }
  };
  const onFilesSelected = (selected: FileList | null) => {
    setSubmitted(false);
    setFiles(Array.from(selected ?? []).slice(0, MAX_RELEASE_FILES));
  };
  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index));
  };

  if (atLimit) {
    return (
      <div className="mt-5 border-t border-border pt-5">
        <p className="text-sm font-medium text-foreground">
          {DOCUMENT_CONFIG[documentType].title}: no submissions left
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          You've used all {MAX_RELEASE_REQUESTS_PER_DOCUMENT} of your release
          submissions for this document. An admin will review what you've sent.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 border-t border-border pt-5 space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">
          {DOCUMENT_CONFIG[documentType].title}: {label}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Upload up to {MAX_RELEASE_FILES} images or PDFs for admin review.
          {" "}
          {attemptsLeft} of {MAX_RELEASE_REQUESTS_PER_DOCUMENT} submissions left.
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
            JPG, PNG, or PDF. Maximum {MAX_RELEASE_FILES} files.
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
  releaseRequests,
  onReleaseRequestSubmitted,
}: {
  documentTypes: DocumentType[];
  vaultSummary: VaultSummary;
  releaseRequests: ReleaseRequest[];
  onReleaseRequestSubmitted: () => void;
}) {
  return (
    <section className="card-surface p-5 md:p-6">
      <h2 className="text-xl font-semibold mb-2">Request another release</h2>
      <p className="text-muted-foreground mb-5">
        You have another delayed permission on this vault. Submit proof for
        admin review to release that document section.
      </p>
      <div className="space-y-5">
        {documentTypes.map((documentType) => {
          const forDoc = releaseRequests.filter(
            (rr) => rr.documentType === documentType,
          );
          return (
            <div key={documentType}>
              <ReleaseRequestsSummary requests={forDoc} />
              <ReleaseRequestForm
                documentType={documentType}
                designation={designationForDocument(vaultSummary, documentType)}
                submissionsUsed={forDoc.length}
                onSubmitted={onReleaseRequestSubmitted}
              />
            </div>
          );
        })}
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
          <Link to="/members" className="link font-semibold">
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
      <h2 className="text-xl font-semibold mb-2">Emergency contact</h2>
      <p className="text-lg font-medium">{name}</p>
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
  releaseRequests,
  onReleaseRequestSubmitted,
}: {
  vaultName: string;
  ownerName: string;
  identityHidden: boolean;
  vaultSummary: VaultSummary;
  releaseDocuments: DocumentType[];
  releaseRequests: ReleaseRequest[];
  onReleaseRequestSubmitted: () => void;
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
              {documents.map((documentType) => {
                const forDoc = releaseRequests.filter(
                  (rr) => rr.documentType === documentType,
                );
                return (
                  <div key={documentType} className="card-surface p-5 md:p-6">
                    <ReleaseRequestsSummary requests={forDoc} />
                    <ReleaseRequestForm
                      documentType={documentType}
                      designation={designationForDocument(vaultSummary, documentType)}
                      submissionsUsed={forDoc.length}
                      onSubmitted={onReleaseRequestSubmitted}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

// Only the singular legal documents participate in the proof-based release
// request flow; the list sections do not.
function isReleaseRequestDocument(section: string): section is DocumentType {
  return (
    section === "will" ||
    section === "power_of_attorney" ||
    section === "health_care_directive"
  );
}

function releaseRequestDocumentsForSummary(summary: VaultSummary): DocumentType[] {
  if (summary.role === "owner") return [];
  const vaultReleased = Boolean(summary.releasedAt);
  const releasedDocuments = summary.releasedDocuments ?? [];
  const recordedDocuments = summary.recordedDocuments ?? [];
  if (recordedDocuments.length) {
    return recordedDocuments.filter(
      (documentType): documentType is DocumentType =>
        isReleaseRequestDocument(documentType) &&
        !vaultReleased &&
        !releasedDocuments.includes(documentType),
    );
  }
  const permissions = summary.permissions?.length
    ? summary.permissions
    : [permissionForSummaryRole(summary)];
  const out: DocumentType[] = [];

  for (const permission of permissions) {
    if (!permission) continue;
    if (!isReleaseRequestDocument(permission.documentType)) continue;
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
