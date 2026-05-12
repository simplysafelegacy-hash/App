import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useApp } from "@/context/AppContext";
import type { VaultMember, VaultRole } from "@/lib/types";
import { roleDescription, roleLabel } from "@/lib/permissions";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

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
      <div className="container py-8 md:py-12 max-w-4xl">
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-2 text-base text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
          Back to vault
        </button>

        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">People</h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Stewards can read and download documents now. Successors are sealed
            out until you release the vault.
          </p>
        </header>

        <section className="card-surface p-6 md:p-8 mb-10">
          <h2 className="text-xl font-semibold mb-1">
            Add a {roleLabel[draftRole].toLowerCase()}
          </h2>
          <p className="text-muted-foreground mb-6">
            {roleDescription[draftRole]}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-3">
              <label className="field-label">Role</label>
              <div className="grid grid-cols-2 border border-border rounded-md overflow-hidden">
                {(["steward", "successor"] as VaultRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setDraftRole(r)}
                    className={`py-3 text-sm font-medium transition-colors ${
                      draftRole === r
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {roleLabel[r]}
                  </button>
                ))}
              </div>
            </div>
            <div className="md:col-span-3">
              <label className="field-label">Name</label>
              <input
                type="text"
                placeholder="Michael Mitchell"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="field"
              />
            </div>
            <div className="md:col-span-4">
              <label className="field-label">Email</label>
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
                className="btn-primary w-full"
                disabled={!draftName.trim() || !draftEmail.trim()}
              >
                <Plus size={16} strokeWidth={1.75} />
                Add
              </button>
            </div>
          </div>
        </section>

        <Section
          title="Stewards"
          description="Active access — may read and download granted documents."
          members={stewards}
          totalDocs={vault.documents.length}
          onRemove={(id) => setConfirmRemove(id)}
        />

        <div className="h-10" />

        <Section
          title="Successors"
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
          className="fixed inset-0 z-50 bg-foreground/30 flex items-center justify-center p-4"
          onClick={() => setConfirmRemove(null)}
        >
          <div
            className="card-surface max-w-md w-full p-6 bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-bold mb-3">
              Remove {memberToRemove.name}?
            </h3>
            <p className="text-muted-foreground mb-6">
              They will no longer appear on this vault. You can add them again
              at any time.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmRemove(null)}
                className="btn-secondary"
              >
                Keep them
              </button>
              <button
                onClick={async () => {
                  await removeMember(confirmRemove);
                  setConfirmRemove(null);
                }}
                className="btn-destructive"
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
  description,
  members,
  totalDocs,
  onRemove,
}: {
  title: string;
  description: string;
  members: VaultMember[];
  totalDocs: number;
  onRemove: (id: string) => void;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {members.length} {members.length === 1 ? "person" : "people"}
        </p>
      </div>
      <p className="text-muted-foreground mb-4">{description}</p>

      {members.length === 0 ? (
        <div className="card-surface p-8 text-center">
          <p className="text-muted-foreground">None named yet.</p>
        </div>
      ) : (
        <ul className="card-surface divide-y divide-border">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-4 px-5 py-4"
            >
              <span className="w-10 h-10 rounded-full bg-secondary text-foreground inline-flex items-center justify-center text-base font-semibold shrink-0">
                {m.name.charAt(0).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-medium text-foreground truncate">
                  {m.name}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {m.email}
                </p>
                {!m.userId && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pending — will activate on signup
                  </p>
                )}
              </div>
              <div className="hidden sm:block text-right shrink-0">
                <p className="text-base text-foreground tnum">
                  {m.documentIds.length}
                  <span className="text-muted-foreground"> of {totalDocs}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  documents
                </p>
              </div>
              <button
                onClick={() => onRemove(m.id)}
                className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-md shrink-0"
                aria-label={`Remove ${m.name}`}
              >
                <Trash2 size={18} strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
