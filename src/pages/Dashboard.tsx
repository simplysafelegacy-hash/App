import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useApp } from "@/context/AppContext";
import { documentTypeLabels, locationTypeLabels } from "@/lib/mockData";
import { roleLabel } from "@/lib/permissions";
import { RoleBadge } from "@/components/VaultSwitcher";
import { ArrowUpRight, Download, Plus, Unlock } from "lucide-react";

const romanize = (n: number): string => {
  const map: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let s = "";
  let r = n;
  for (const [v, l] of map) {
    while (r >= v) {
      s += l;
      r -= v;
    }
  }
  return s || "—";
};

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

  // Successors before release see a different shell.
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
      <div className="container py-10 md:py-16">
        <header className="fade-in-up">
          <div className="flex items-baseline justify-between mb-2">
            <p className="eyebrow">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <p className="eyebrow text-ink-subtle">
              Folio № {romanize(docCount + 1)}
            </p>
          </div>

          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mt-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <RoleBadge role={currentVaultSummary.role} />
                {vault.releasedAt && (
                  <span className="eyebrow text-seal">Released</span>
                )}
              </div>
              <h1 className="display-serif text-5xl md:text-6xl leading-[0.98]">
                {permissions.isOwner ? (
                  <>
                    Good morning, <br />
                    <span className="italic-serif text-seal">{firstName}.</span>
                  </>
                ) : (
                  <>
                    {vault.ownerName}'s <br />
                    <span className="italic-serif text-seal">vault.</span>
                  </>
                )}
              </h1>
              <p className="mt-4 text-lg text-ink-muted max-w-xl">
                {permissions.isOwner
                  ? "Your vault is in order. Below is the current ledger of papers, members, and notes."
                  : permissions.isSteward
                    ? `You are named as a steward. Documents granted to you are listed below.`
                    : `You are named as a successor. Access has been released.`}
              </p>
            </div>
            {permissions.canModify ? (
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <Link to="/add-document" className="btn-ink">
                  <Plus size={18} strokeWidth={1.5} />
                  Record a paper
                </Link>
                <ReleaseButton released={!!vault.releasedAt} onToggle={releaseVault} />
              </div>
            ) : null}
          </div>
        </header>

        <div className="rule my-10 md:my-14" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-0 md:divide-x md:divide-hairline fade-in-up delay-100">
          <StatCell
            eyebrow="Papers visible"
            figure={romanize(docCount)}
            sub={`${docCount} ${docCount === 1 ? "document" : "documents"} ${
              permissions.isOwner ? "recorded" : "granted to you"
            }`}
          />
          {permissions.isOwner ? (
            <>
              <StatCell
                eyebrow={`${roleLabel.steward}s & ${roleLabel.successor}s`}
                figure={romanize(memberCount)}
                sub={
                  memberCount === 0
                    ? "None named yet"
                    : `${memberCount} ${memberCount === 1 ? "person" : "people"} named`
                }
              />
              <StatCell
                eyebrow="Last entry"
                figure={
                  lastUpdated
                    ? lastUpdated.toLocaleDateString("en-US", { day: "numeric" })
                    : "—"
                }
                sub={
                  lastUpdated
                    ? lastUpdated.toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                      })
                    : "Awaiting first entry"
                }
              />
            </>
          ) : (
            <>
              <StatCell
                eyebrow="Owner"
                figure={vault.ownerName.split(" ")[0]}
                sub={vault.ownerName}
              />
              <StatCell
                eyebrow="Status"
                figure={vault.releasedAt ? "Released" : "Sealed"}
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

        <div className="rule mt-10 md:mt-14" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 mt-10 md:mt-14">
          <section className="lg:col-span-8 fade-in-up delay-200">
            <div className="flex items-baseline justify-between mb-8">
              <h2 className="font-serif text-3xl tracking-tight">The Ledger</h2>
              <p className="italic-serif text-ink-subtle">
                {docCount} {docCount === 1 ? "entry" : "entries"}
              </p>
            </div>

            {docCount === 0 ? (
              <EmptyLedger canModify={permissions.canModify} />
            ) : (
              <ul className="divide-y divide-hairline border-y border-hairline">
                {vault.documents.map((doc, idx) => (
                  <li key={doc.id}>
                    <div className="grid grid-cols-12 items-baseline gap-4 py-6 px-1 group hover:bg-paper-alt/50 transition-colors -mx-1">
                      <span className="col-span-1 eyebrow text-ink-subtle tnum">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div className="col-span-7 md:col-span-5">
                        <Link
                          to={`/document/${doc.id}`}
                          className="block group/link"
                        >
                          <p
                            className="font-serif text-xl md:text-2xl tracking-tight text-ink group-hover/link:text-seal transition-colors"
                            style={{ fontVariationSettings: "'opsz' 36" }}
                          >
                            {doc.name}
                          </p>
                          <p className="italic-serif text-ink-muted mt-0.5">
                            {documentTypeLabels[doc.type]} · kept at{" "}
                            {locationTypeLabels[doc.locationType]}
                          </p>
                        </Link>
                      </div>
                      <div className="col-span-3 hidden md:block text-right">
                        <p className="text-[15px] text-ink tnum">
                          {new Date(doc.lastUpdated).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </p>
                        {permissions.isOwner && (
                          <p className="text-xs text-ink-subtle mt-0.5">
                            {doc.memberIds.length}{" "}
                            {doc.memberIds.length === 1
                              ? "person"
                              : "people"}{" "}
                            granted
                          </p>
                        )}
                      </div>
                      <div className="col-span-4 md:col-span-3 text-right flex items-center justify-end gap-1">
                        {doc.hasFile && permissions.canDownload && (
                          <button
                            onClick={() => downloadDocument(doc.id)}
                            className="p-2 text-ink-muted hover:text-seal transition-colors"
                            aria-label="Download"
                            title="Download digital copy"
                          >
                            <Download size={18} strokeWidth={1.25} />
                          </button>
                        )}
                        <Link
                          to={`/document/${doc.id}`}
                          className="p-2 text-ink-muted hover:text-seal transition-colors"
                          aria-label="View"
                        >
                          <ArrowUpRight size={20} strokeWidth={1.25} />
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="lg:col-span-4 space-y-10 fade-in-up delay-300">
            {permissions.isOwner && (
              <Panel
                eyebrow="Who may see"
                title="People named"
                action={{ to: "/members", label: "Manage" }}
              >
                {vault.members.filter((m) => m.role !== "owner").length === 0 ? (
                  <p className="italic-serif text-ink-muted py-4">
                    No one named yet. When you are ready, invite the people
                    who should know.
                  </p>
                ) : (
                  <ul className="divide-y divide-hairline-soft">
                    {vault.members
                      .filter((m) => m.role !== "owner")
                      .map((m) => (
                        <li
                          key={m.id}
                          className="py-4 flex items-center gap-4"
                        >
                          <span
                            className="seal-mark"
                            style={{ width: 36, height: 36, fontSize: 16 }}
                          >
                            {m.name.charAt(0)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-ink font-medium truncate">
                              {m.name}
                            </p>
                            <p className="text-sm text-ink-subtle truncate">
                              {roleLabel[m.role]}
                            </p>
                          </div>
                          <p className="italic-serif text-sm text-ink-muted shrink-0">
                            {m.documentIds.length} papers
                          </p>
                        </li>
                      ))}
                  </ul>
                )}
              </Panel>
            )}

            {(permissions.isOwner ||
              vault.emergencyContactName) && (
              <Panel eyebrow="In case of" title="Emergency contact">
                {vault.emergencyContactName ? (
                  <div className="py-4">
                    <p className="font-serif text-lg tracking-tight">
                      {vault.emergencyContactName}
                    </p>
                    <p className="text-ink-muted tnum mt-1">
                      {vault.emergencyContactPhone}
                    </p>
                  </div>
                ) : (
                  <p className="italic-serif text-ink-muted py-4">
                    Not visible to you.
                  </p>
                )}
              </Panel>
            )}

            <Panel eyebrow="Recent" title="Activity">
              {notifications.length === 0 ? (
                <p className="italic-serif text-ink-muted py-4">
                  Nothing new to mention.
                </p>
              ) : (
                <ul className="divide-y divide-hairline-soft">
                  {notifications.slice(0, 4).map((n) => (
                    <li key={n.id} className="py-3">
                      <p className="text-[15px] text-ink leading-snug">
                        {n.message}
                      </p>
                      <p className="text-xs text-ink-subtle mt-1 italic-serif">
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
      <button
        onClick={() => setConfirming(true)}
        className={released ? "btn-ghost" : "btn-ghost"}
      >
        <Unlock size={16} strokeWidth={1.5} />
        {released ? "Re-seal vault" : "Release vault"}
      </button>
      {confirming && (
        <div
          className="fixed inset-0 z-50 bg-ink/30 flex items-center justify-center p-4"
          onClick={() => setConfirming(false)}
        >
          <div
            className="paper-card max-w-md w-full p-8"
            style={{ borderRadius: "2px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="eyebrow mb-4">A serious matter</p>
            <h3 className="font-serif text-3xl mb-4 tracking-tight">
              {released ? "Re-seal this vault?" : "Release this vault?"}
            </h3>
            <p className="italic-serif text-ink-muted mb-8">
              {released
                ? "Successors will lose access until you release the vault again."
                : "Successors will gain immediate access to the documents granted to them. Stewards already had access."}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirming(false)}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onToggle(!released);
                  setConfirming(false);
                }}
                className="btn-seal"
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

function StatCell({
  eyebrow,
  figure,
  sub,
}: {
  eyebrow: string;
  figure: string;
  sub: string;
}) {
  return (
    <div className="md:px-10 first:md:pl-0 last:md:pr-0">
      <p className="eyebrow mb-4">{eyebrow}</p>
      <p
        className="display-serif text-6xl md:text-7xl text-ink tnum"
        style={{ fontVariationSettings: "'opsz' 144" }}
      >
        {figure}
      </p>
      <p className="italic-serif text-ink-muted mt-3">{sub}</p>
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: { to: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <p className="eyebrow mb-1">{eyebrow}</p>
          <h3 className="font-serif text-2xl tracking-tight">{title}</h3>
        </div>
        {action && (
          <Link to={action.to} className="text-sm link-ink">
            {action.label}
          </Link>
        )}
      </div>
      <div className="border-t border-hairline">{children}</div>
    </div>
  );
}

function EmptyLedger({ canModify }: { canModify: boolean }) {
  return (
    <div className="paper-card p-12 text-center" style={{ borderRadius: "2px" }}>
      <div
        className="seal-mark mx-auto mb-6"
        style={{ width: 64, height: 64, fontSize: 28, opacity: 0.6 }}
      >
        S
      </div>
      <h3 className="font-serif text-2xl tracking-tight mb-3">
        {canModify ? "An empty page — for now." : "Nothing has been granted to you yet."}
      </h3>
      <p className="italic-serif text-ink-muted mb-8 max-w-sm mx-auto">
        {canModify
          ? "Begin with the paper that weighs heaviest. For most people, that is the will itself."
          : "When the vault owner grants you access to a document, it will appear here."}
      </p>
      {canModify && (
        <Link to="/add-document" className="btn-ink">
          <Plus size={18} strokeWidth={1.5} />
          Record the first paper
        </Link>
      )}
    </div>
  );
}

/**
 * SealedSuccessorView — what a successor sees when the vault has not yet
 * been released. No documents, no members, no contact details — just an
 * acknowledgment that the vault exists and is being kept.
 */
function SealedSuccessorView({
  vaultName,
  ownerName,
}: {
  vaultName: string;
  ownerName: string;
}) {
  return (
    <Layout>
      <div className="container py-24 md:py-40 max-w-2xl text-center">
        <div className="fade-in">
          <div
            className="seal-mark mx-auto mb-10"
            style={{
              width: 88,
              height: 88,
              fontSize: 42,
              transform: "rotate(-4deg)",
              boxShadow:
                "inset 0 0 0 2px hsl(var(--paper)/.2), 0 4px 14px hsl(36 12% 9%/.15)",
            }}
          >
            S
          </div>
          <p className="eyebrow mb-5">A vault held in trust</p>
          <h1 className="display-serif text-5xl md:text-7xl leading-[0.96] text-balance fade-in-up delay-100">
            <span className="italic-serif text-seal">Sealed.</span>
          </h1>
          <p className="mt-8 text-lg italic-serif text-ink-muted max-w-md mx-auto fade-in-up delay-200">
            {vaultName} is being kept by {ownerName}. You have been named as a
            successor — when the vault is released, the documents granted to
            you will appear here.
          </p>
          <p className="mt-3 text-sm text-ink-subtle italic-serif fade-in-up delay-300">
            You will be notified at that time. Nothing further is required of
            you now.
          </p>
        </div>
      </div>
    </Layout>
  );
}
