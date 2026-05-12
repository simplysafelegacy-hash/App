import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useApp } from "@/context/AppContext";
import type { VaultMember, VaultRole } from "@/lib/types";
import { roleDescription, roleLabel } from "@/lib/permissions";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

/**
 * Members — owner-only page for managing the people named on a vault. Two
 * sections: stewards (current access) and successors (gated by release).
 */
export default function Members() {
  const {
    vault,
    permissions,
    addMember,
    removeMember,
    isAuthenticated,
    loading,
  } = useApp();
  const navigate = useNavigate();
  const [draftRole, setDraftRole] = useState<VaultRole>("steward");
  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) navigate("/login");
    else if (!permissions.isOwner) navigate("/dashboard");
  }, [isAuthenticated, permissions.isOwner, loading, navigate]);

  if (!vault || !permissions.isOwner) return null;

  const stewards = vault.members.filter((m) => m.role === "steward");
  const successors = vault.members.filter((m) => m.role === "successor");

  const onAdd = async () => {
    if (!draftName.trim() || !draftEmail.trim()) return;
    await addMember({
      name: draftName.trim(),
      email: draftEmail.trim(),
      role: draftRole,
    });
    setDraftName("");
    setDraftEmail("");
  };

  const memberToRemove =
    vault.members.find((m) => m.id === confirmRemove) ?? null;

  return (
    <Layout>
      <div className="container py-10 md:py-14 max-w-5xl">
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-2 text-[15px] text-ink-muted hover:text-ink transition-colors mb-10"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
          Back to the vault
        </button>

        <header className="mb-12 fade-in-up">
          <p className="eyebrow mb-5">The people named</p>
          <h1 className="display-serif text-5xl md:text-6xl leading-[0.98] text-balance">
            Stewards and <br />
            <span className="italic-serif text-seal">successors.</span>
          </h1>
          <p className="mt-5 text-lg text-ink-muted max-w-2xl">
            Stewards are trusted now — they may read the vault and download
            copies. Successors are trusted later — they remain sealed out
            until you release the vault.
          </p>
        </header>

        {/* Add new */}
        <section
          className="paper-card p-8 md:p-10 mb-14 fade-in-up delay-100"
          style={{ borderRadius: "2px" }}
        >
          <h2 className="font-serif text-2xl tracking-tight mb-1">
            Name a new {roleLabel[draftRole].toLowerCase()}
          </h2>
          <p className="italic-serif text-ink-muted mb-8">
            {roleDescription[draftRole]}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
            <div className="md:col-span-3">
              <label className="field-label">Role</label>
              <div
                className="grid grid-cols-2 border border-hairline"
                style={{ borderRadius: "2px" }}
              >
                {(["steward", "successor"] as VaultRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setDraftRole(r)}
                    className={`py-3 text-[14px] tracking-[0.08em] uppercase transition-colors ${
                      draftRole === r
                        ? "bg-ink text-paper"
                        : "text-ink-muted hover:bg-paper-sunk/40"
                    }`}
                  >
                    {roleLabel[r]}
                  </button>
                ))}
              </div>
            </div>
            <div className="md:col-span-3">
              <label className="field-label">Full name</label>
              <input
                type="text"
                placeholder="Michael Mitchell"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="field"
              />
            </div>
            <div className="md:col-span-4">
              <label className="field-label">Email address</label>
              <input
                type="email"
                placeholder="michael@example.com"
                value={draftEmail}
                onChange={(e) => setDraftEmail(e.target.value)}
                className="field"
              />
            </div>
            <div className="md:col-span-2">
              <button
                onClick={onAdd}
                className="btn-ink w-full !min-h-[48px]"
                disabled={!draftName.trim() || !draftEmail.trim()}
              >
                <Plus size={16} strokeWidth={1.5} />
                Name
              </button>
            </div>
          </div>
        </section>

        <Section
          title="Stewards"
          eyebrow="Trusted now"
          description="Active access — may read and download granted documents."
          members={stewards}
          totalDocs={vault.documents.length}
          onRemove={(id) => setConfirmRemove(id)}
        />

        <div className="rule my-14" />

        <Section
          title="Successors"
          eyebrow="Trusted later"
          description={
            vault.releasedAt
              ? "The vault has been released — successors now have access."
              : "Sealed until the vault is released."
          }
          members={successors}
          totalDocs={vault.documents.length}
          onRemove={(id) => setConfirmRemove(id)}
        />
      </div>

      {confirmRemove && memberToRemove && (
        <div
          className="fixed inset-0 z-50 bg-ink/30 flex items-center justify-center p-4"
          onClick={() => setConfirmRemove(null)}
        >
          <div
            className="paper-card max-w-md w-full p-8"
            style={{ borderRadius: "2px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="eyebrow mb-4">A final question</p>
            <h3 className="font-serif text-3xl mb-4 tracking-tight">
              Remove {memberToRemove.name}?
            </h3>
            <p className="italic-serif text-ink-muted mb-8">
              They will no longer appear on this vault. You can name them
              again at any time.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmRemove(null)}
                className="btn-ghost"
              >
                Keep them
              </button>
              <button
                onClick={async () => {
                  await removeMember(confirmRemove);
                  setConfirmRemove(null);
                }}
                className="btn-seal"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Section({
  title,
  eyebrow,
  description,
  members,
  totalDocs,
  onRemove,
}: {
  title: string;
  eyebrow: string;
  description: string;
  members: VaultMember[];
  totalDocs: number;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="fade-in-up delay-200">
      <div className="flex items-baseline justify-between mb-1">
        <div>
          <p className="eyebrow mb-1">{eyebrow}</p>
          <h2 className="font-serif text-3xl tracking-tight">{title}</h2>
        </div>
        <p className="italic-serif text-ink-subtle">
          {members.length} {members.length === 1 ? "person" : "people"}
        </p>
      </div>
      <p className="italic-serif text-ink-muted mb-6">{description}</p>

      {members.length === 0 ? (
        <div
          className="paper-card p-10 text-center"
          style={{ borderRadius: "2px" }}
        >
          <p className="italic-serif text-ink-muted">None named yet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {members.map((m, idx) => (
            <li
              key={m.id}
              className="grid grid-cols-12 items-center gap-4 py-6 px-1 -mx-1"
            >
              <span className="col-span-1 eyebrow text-ink-subtle tnum hidden sm:block">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <div className="col-span-12 sm:col-span-1">
                <span
                  className="seal-mark"
                  style={{ width: 40, height: 40, fontSize: 18 }}
                >
                  {m.name.charAt(0)}
                </span>
              </div>
              <div className="col-span-7 sm:col-span-6">
                <p
                  className="font-serif text-xl tracking-tight"
                  style={{ fontVariationSettings: "'opsz' 36" }}
                >
                  {m.name}
                </p>
                <p className="text-sm text-ink-subtle">{m.email}</p>
                {!m.userId && (
                  <p className="italic-serif text-xs text-ink-subtle mt-1">
                    Pending — will activate on signup
                  </p>
                )}
              </div>
              <div className="col-span-3 sm:col-span-3 text-right">
                <p className="text-[15px] text-ink tnum">
                  {m.documentIds.length}{" "}
                  <span className="italic-serif text-ink-muted">
                    of {totalDocs}
                  </span>
                </p>
                <p className="text-xs text-ink-subtle mt-0.5">
                  papers granted
                </p>
              </div>
              <div className="col-span-2 sm:col-span-1 text-right">
                <button
                  onClick={() => onRemove(m.id)}
                  className="p-2 text-ink-muted hover:text-seal transition-colors"
                  aria-label={`Remove ${m.name}`}
                >
                  <Trash2 size={16} strokeWidth={1.5} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
