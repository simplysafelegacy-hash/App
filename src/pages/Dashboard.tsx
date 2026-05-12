import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useApp } from "@/context/AppContext";
import { documentTypeLabels, locationTypeLabels } from "@/lib/mockData";
import { roleLabel } from "@/lib/permissions";
import { RoleBadge } from "@/components/VaultSwitcher";
import { ArrowUpRight, Download, Plus, Unlock } from "lucide-react";

export default function Dashboard() {
  const {
    vault,
    isAuthenticated,
    currentUser,
    notifications,
    permissions,
    currentVaultSummary,
    releaseVault,
    downloadDocument,
    loading,
  } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) navigate("/login");
    else if (!vault && permissions.isOwner) navigate("/create-vault");
  }, [isAuthenticated, vault, permissions.isOwner, loading, navigate]);

  if (!vault || !currentVaultSummary) return null;

  if (permissions.isSealed) {
    return <SealedSuccessorView vaultName={vault.name} ownerName={vault.ownerName} />;
  }

  const docCount = vault.documents.length;
  const memberCount = vault.members.filter((m) => m.role !== "owner").length;
  const lastUpdated =
    docCount > 0
      ? new Date(
          Math.max(...vault.documents.map((d) => new Date(d.lastUpdated).getTime())),
        )
      : null;
  const firstName = (currentUser?.name || vault.ownerName).split(" ")[0];

  return (
    <Layout>
      <div className="container py-8 md:py-12">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
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
                ? "Your documents, the people who may see them, and where they're kept."
                : permissions.isSteward
                  ? "Documents granted to you are listed below."
                  : "You are named as a successor. Access has been released."}
            </p>
          </div>
          {permissions.canModify ? (
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <Link to="/add-document" className="btn-primary">
                <Plus size={18} strokeWidth={1.75} />
                Add document
              </Link>
              <ReleaseButton released={!!vault.releasedAt} onToggle={releaseVault} />
            </div>
          ) : null}
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <StatCard
            label="Documents"
            value={docCount.toString()}
            sub={
              permissions.isOwner
                ? `${docCount === 1 ? "1 document" : `${docCount} documents`} recorded`
                : `${docCount === 1 ? "1 document" : `${docCount} documents`} granted`
            }
          />
          {permissions.isOwner ? (
            <>
              <StatCard
                label="People"
                value={memberCount.toString()}
                sub={
                  memberCount === 0
                    ? "None named yet"
                    : `${memberCount === 1 ? "1 person" : `${memberCount} people`} named`
                }
              />
              <StatCard
                label="Last update"
                value={
                  lastUpdated
                    ? lastUpdated.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : "—"
                }
                sub={
                  lastUpdated
                    ? lastUpdated.toLocaleDateString("en-US", { year: "numeric" })
                    : "No documents yet"
                }
              />
            </>
          ) : (
            <>
              <StatCard
                label="Owner"
                value={vault.ownerName.split(" ")[0]}
                sub={vault.ownerName}
              />
              <StatCard
                label="Status"
                value={vault.releasedAt ? "Released" : "Sealed"}
                sub={
                  vault.releasedAt
                    ? new Date(vault.releasedAt).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Held in trust"
                }
              />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-2xl font-semibold">Documents</h2>
              <p className="text-sm text-muted-foreground">
                {docCount} {docCount === 1 ? "entry" : "entries"}
              </p>
            </div>

            {docCount === 0 ? (
              <EmptyDocuments canModify={permissions.canModify} />
            ) : (
              <ul className="card-surface divide-y divide-border">
                {vault.documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/document/${doc.id}`}
                        className="block group"
                      >
                        <p className="text-lg font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {doc.name}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {documentTypeLabels[doc.type]} · {locationTypeLabels[doc.locationType]}
                        </p>
                      </Link>
                    </div>
                    <div className="hidden md:block text-right shrink-0">
                      <p className="text-sm text-foreground tnum">
                        {new Date(doc.lastUpdated).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                      {permissions.isOwner && (
                        <p className="text-xs text-muted-foreground">
                          {doc.memberIds.length}{" "}
                          {doc.memberIds.length === 1 ? "person" : "people"}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {doc.hasFile && permissions.canDownload && (
                        <button
                          onClick={() => downloadDocument(doc.id)}
                          className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-md"
                          aria-label="Download"
                          title="Download"
                        >
                          <Download size={18} strokeWidth={1.5} />
                        </button>
                      )}
                      <Link
                        to={`/document/${doc.id}`}
                        className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-md"
                        aria-label="View"
                      >
                        <ArrowUpRight size={18} strokeWidth={1.5} />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="space-y-6">
            {permissions.isOwner && (
              <Panel
                title="People"
                action={{ to: "/members", label: "Manage" }}
              >
                {vault.members.filter((m) => m.role !== "owner").length === 0 ? (
                  <p className="text-muted-foreground py-2">
                    No one named yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {vault.members
                      .filter((m) => m.role !== "owner")
                      .map((m) => (
                        <li key={m.id} className="py-3 flex items-center gap-3">
                          <Avatar name={m.name} />
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground font-medium truncate">
                              {m.name}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              {roleLabel[m.role]}
                            </p>
                          </div>
                          <p className="text-sm text-muted-foreground shrink-0">
                            {m.documentIds.length}{" "}
                            {m.documentIds.length === 1 ? "doc" : "docs"}
                          </p>
                        </li>
                      ))}
                  </ul>
                )}
              </Panel>
            )}

            {(permissions.isOwner || vault.emergencyContactName) && (
              <Panel title="Emergency contact">
                {vault.emergencyContactName ? (
                  <div>
                    <p className="text-lg font-medium">
                      {vault.emergencyContactName}
                    </p>
                    <p className="text-muted-foreground tnum">
                      {vault.emergencyContactPhone}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Not visible to you.</p>
                )}
              </Panel>
            )}

            <Panel title="Recent activity">
              {notifications.length === 0 ? (
                <p className="text-muted-foreground">Nothing new.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {notifications.slice(0, 4).map((n) => (
                    <li key={n.id} className="py-3">
                      <p className="text-base text-foreground leading-snug">
                        {n.message}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {new Date(n.timestamp).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </aside>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="card-surface p-5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold text-foreground mt-1 tnum">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: { to: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="card-surface p-5">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        {action && (
          <Link to={action.to} className="text-sm link">
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="w-9 h-9 rounded-full bg-secondary text-foreground inline-flex items-center justify-center text-sm font-semibold shrink-0">
      {name.charAt(0).toUpperCase()}
    </span>
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
                : "Successors will gain immediate access to the documents granted to them. Stewards already had access."}
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

function EmptyDocuments({ canModify }: { canModify: boolean }) {
  return (
    <div className="card-surface p-10 text-center">
      <h3 className="text-xl font-semibold mb-2">
        {canModify ? "No documents yet" : "Nothing has been granted to you yet"}
      </h3>
      <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
        {canModify
          ? "Start with the most important one. For most people, that's the will itself."
          : "When the vault owner grants you access to a document, it will appear here."}
      </p>
      {canModify && (
        <Link to="/add-document" className="btn-primary inline-flex">
          <Plus size={18} strokeWidth={1.75} />
          Add the first document
        </Link>
      )}
    </div>
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
          You've been named as a successor — when the vault is released, the
          documents granted to you will appear here. You'll be notified at
          that time. Nothing is required of you now.
        </p>
      </div>
    </Layout>
  );
}
