import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useApp } from "@/context/AppContext";
import { roleLabel, willLocationLabel } from "@/lib/permissions";
import { RoleBadge } from "@/components/VaultSwitcher";
import type { Will, WillLocationType } from "@/lib/types";
import { Pencil, Plus, Unlock } from "lucide-react";

const WILL_LOCATIONS: { value: WillLocationType; label: string }[] = [
  { value: "home_safe", label: "Home safe" },
  { value: "bank_safety_deposit", label: "Bank safety deposit box" },
  { value: "attorney_office", label: "Attorney's office" },
  { value: "other", label: "Other" },
];

export default function Dashboard() {
  const {
    vault,
    isAuthenticated,
    currentUser,
    permissions,
    currentVaultSummary,
    releaseVault,
    loading,
    refreshVault,
  } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) navigate("/login");
    else if (!vault && permissions.isOwner) navigate("/create-vault");
  }, [isAuthenticated, vault, permissions.isOwner, loading, navigate]);

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
    return <SealedSuccessorView vaultName={vault.name} ownerName={vault.ownerName} />;
  }

  const memberCount = vault.members.filter((m) => m.role !== "owner").length;
  const firstName = (currentUser?.name || vault.ownerName).split(" ")[0];

  return (
    <Layout>
      <div className="container py-8 md:py-12 max-w-4xl">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <RoleBadge role={currentVaultSummary.role} />
              {vault.releasedAt && (
                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-accent/20 text-foreground">
                  Released
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">
              {permissions.isOwner
                ? `Welcome, ${firstName}`
                : `${vault.ownerName}'s vault`}
            </h1>
            <p className="mt-2 text-lg text-muted-foreground max-w-xl">
              {permissions.isOwner
                ? "Your will, who can see it, and where it's kept."
                : permissions.isSteward
                  ? "You can see the will and where it's kept."
                  : "Access has been released."}
            </p>
          </div>
          {permissions.canModify && (
            <ReleaseButton released={!!vault.releasedAt} onToggle={releaseVault} />
          )}
        </header>

        {permissions.isOwner && currentUser && (
          <SubscriptionStrip user={currentUser} />
        )}

        <WillCard
          will={vault.will}
          canEdit={permissions.canModify}
        />

        <div className="h-8" />

        <PeopleCard
          memberCount={memberCount}
          released={!!vault.releasedAt}
          canEdit={permissions.canModify}
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

function SubscriptionStrip({ user }: { user: { subscriptionStatus?: string | null; subscriptionPlan?: string | null; currentPeriodEnd?: string | null } }) {
  const { openCustomerPortal } = useApp();
  const status = user.subscriptionStatus;
  const plan = user.subscriptionPlan;

  if (!status) {
    return (
      <div className="card-surface p-4 mb-8 flex items-center justify-between gap-4 bg-secondary/40">
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
    <div className="card-surface p-4 mb-8 flex items-center justify-between gap-4">
      <div>
        <p className="text-base font-medium capitalize">
          {plan ?? "Active"} plan
          <span className="text-muted-foreground font-normal">
            {" · "}
            {status === "trialing" ? "Trial" : status}
          </span>
        </p>
        {renews && (
          <p className="text-sm text-muted-foreground">
            {status === "canceled" ? "Ends" : "Renews"} {renews}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => openCustomerPortal().catch(() => {})}
        className="btn-secondary !min-h-[40px] !text-sm"
      >
        Manage
      </button>
    </div>
  );
}

function WillCard({ will, canEdit }: { will: Will; canEdit: boolean }) {
  const { updateWill } = useApp();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    hasWill: will.hasWill,
    locationType: will.locationType || "",
    locationAddress: will.locationAddress,
    locationDescription: will.locationDescription,
  });

  // Reset draft if vault data updates underneath us.
  useEffect(() => {
    setDraft({
      hasWill: will.hasWill,
      locationType: will.locationType || "",
      locationAddress: will.locationAddress,
      locationDescription: will.locationDescription,
    });
  }, [will]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateWill({
        hasWill: draft.hasWill,
        locationType: draft.hasWill ? draft.locationType : "",
        locationAddress: draft.hasWill ? draft.locationAddress : "",
        locationDescription: draft.hasWill ? draft.locationDescription : "",
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card-surface p-6 md:p-8">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-2xl font-semibold">Your will</h2>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-secondary !min-h-[36px] !text-sm"
          >
            <Pencil size={14} strokeWidth={1.75} />
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        will.hasWill ? (
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Status</dt>
              <dd className="text-base text-foreground">
                Yes — recorded
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Where it's kept
              </dt>
              <dd className="text-base text-foreground">
                {willLocationLabel[will.locationType] || will.locationType || "—"}
              </dd>
            </div>
            {will.locationAddress && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Address
                </dt>
                <dd className="text-base text-foreground">
                  {will.locationAddress}
                </dd>
              </div>
            )}
            {will.locationDescription && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Exact location
                </dt>
                <dd className="text-base text-foreground">
                  {will.locationDescription}
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <div>
            <p className="text-muted-foreground mb-4">
              You haven't recorded a will yet.
            </p>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="btn-primary"
              >
                <Plus size={18} strokeWidth={1.75} />
                Record your will
              </button>
            )}
          </div>
        )
      ) : (
        <form onSubmit={onSave} className="space-y-5">
          <fieldset>
            <legend className="field-label mb-3">
              Do you have a will?
            </legend>
            <div className="flex gap-2">
              <ToggleOption
                checked={draft.hasWill}
                onClick={() => setDraft((d) => ({ ...d, hasWill: true }))}
                label="Yes"
              />
              <ToggleOption
                checked={!draft.hasWill}
                onClick={() => setDraft((d) => ({ ...d, hasWill: false }))}
                label="Not yet"
              />
            </div>
          </fieldset>

          {draft.hasWill && (
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
                  {WILL_LOCATIONS.map((opt) => (
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
}: {
  memberCount: number;
  released: boolean;
  canEdit: boolean;
}) {
  return (
    <section className="card-surface p-6 md:p-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-2xl font-semibold">Who has access</h2>
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
        Stewards can see your will now. Successors are{" "}
        {released ? "now able to see it." : "sealed out until you release the vault."}
      </p>
    </section>
  );
}

function EmergencyCard({ name, phone }: { name: string; phone: string }) {
  return (
    <section className="card-surface p-6 md:p-8">
      <h2 className="text-xl font-semibold mb-2">Emergency contact</h2>
      <p className="text-base font-medium">{name}</p>
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
            <h3 className="text-2xl font-bold mb-3">
              {released ? "Re-seal this vault?" : "Release this vault?"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {released
                ? "Successors will lose access until you release the vault again."
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

function SealedSuccessorView({
  vaultName,
  ownerName,
}: {
  vaultName: string;
  ownerName: string;
}) {
  return (
    <Layout>
      <div className="container py-20 md:py-32 max-w-xl text-center">
        <h1 className="text-3xl md:text-4xl font-bold mb-4">
          A vault held in trust
        </h1>
        <p className="text-lg text-muted-foreground mb-3">
          {vaultName} is being kept by {ownerName}.
        </p>
        <p className="text-muted-foreground">
          You've been named as a {roleLabel.successor.toLowerCase()} — when
          the vault is released, the will details will appear here. You'll
          be notified at that time. Nothing is required of you now.
        </p>
      </div>
    </Layout>
  );
}
