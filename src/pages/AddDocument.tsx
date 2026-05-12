import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useApp } from "@/context/AppContext";
import { DocumentType, LocationType, VaultRole } from "@/lib/types";
import { documentTypeLabels, locationTypeLabels } from "@/lib/mockData";
import { roleLabel } from "@/lib/permissions";
import { ArrowLeft, Plus, Upload, X } from "lucide-react";

export default function AddDocument() {
  const {
    addDocument,
    addMember,
    vault,
    permissions,
    isAuthenticated,
    loading,
  } = useApp();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [draftMembers, setDraftMembers] = useState<
    { name: string; email: string; role: VaultRole }[]
  >([]);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<VaultRole>("steward");
  const [fileName, setFileName] = useState("");

  const [formData, setFormData] = useState({
    type: "" as DocumentType,
    name: "",
    locationType: "" as LocationType,
    address: "",
    description: "",
  });

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) navigate("/login");
    else if (!permissions.canModify) navigate("/dashboard");
  }, [isAuthenticated, permissions.canModify, loading, navigate]);

  if (!permissions.canModify || !vault) return null;

  const onChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFileName(file.name);
  };

  const eligibleMembers = vault.members.filter((m) => m.role !== "owner");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const addDraftMember = () => {
    const email = newEmail.trim();
    if (!email) return;
    if (
      draftMembers.some((d) => d.email === email) ||
      eligibleMembers.some((m) => m.email === email)
    ) {
      setNewEmail("");
      return;
    }
    setDraftMembers([
      ...draftMembers,
      { name: email.split("@")[0], email, role: newRole },
    ]);
    setNewEmail("");
  };

  const removeDraft = (email: string) =>
    setDraftMembers(draftMembers.filter((d) => d.email !== email));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const memberIds: string[] = [...selectedMemberIds];
    for (const draft of draftMembers) {
      const created = await addMember(draft);
      if (created) memberIds.push(created.id);
    }

    await addDocument({
      type: formData.type,
      name: formData.name,
      fileName: fileName || undefined,
      locationType: formData.locationType,
      address: formData.address,
      description: formData.description,
      memberIds,
    });

    navigate("/dashboard");
  };

  return (
    <Layout showFooter={false}>
      <div className="container py-8 md:py-12 max-w-2xl">
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-2 text-base text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
          Back to vault
        </button>

        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            Add a document
          </h1>
          <p className="text-lg text-muted-foreground">
            Tell us what it is, where the original is kept, and who may know
            about it.
          </p>
        </header>

        <form onSubmit={onSubmit} className="card-surface p-6 md:p-8 space-y-10">
          <Section title="The document">
            <Field label="Type">
              <NativeSelect
                name="type"
                value={formData.type}
                onChange={(v) => setFormData({ ...formData, type: v as DocumentType })}
                options={Object.entries(documentTypeLabels)}
                placeholder="Select a type…"
              />
            </Field>
            <Field label="Name">
              <input
                id="name"
                name="name"
                type="text"
                placeholder="e.g. Last Will and Testament"
                value={formData.name}
                onChange={onChange}
                required
                className="field"
              />
            </Field>
          </Section>

          <Section
            title="Digital copy"
            hint="Optional. You can record a document without uploading a file."
          >
            <label
              htmlFor="file"
              className="block border-2 border-dashed border-border rounded-md px-6 py-10 text-center cursor-pointer hover:bg-muted hover:border-primary transition-colors"
            >
              <input
                type="file"
                id="file"
                accept=".pdf,.jpg,.jpeg,.png,.heic"
                onChange={onFileChange}
                className="hidden"
              />
              <Upload size={24} strokeWidth={1.75} className="mx-auto text-muted-foreground mb-3" />
              {fileName ? (
                <div>
                  <p className="text-lg font-medium">{fileName}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Click to choose another
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-base text-foreground">
                    Click to choose a PDF, photo, or scan
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Up to 25 MB
                  </p>
                </div>
              )}
            </label>
          </Section>

          <Section title="Where it's kept">
            <Field label="Location type">
              <NativeSelect
                name="locationType"
                value={formData.locationType}
                onChange={(v) => setFormData({ ...formData, locationType: v as LocationType })}
                options={Object.entries(locationTypeLabels)}
                placeholder="Select a place…"
              />
            </Field>
            <Field label="Address or branch">
              <input
                id="address"
                name="address"
                type="text"
                placeholder="e.g. 14 Oak Ridge Drive"
                value={formData.address}
                onChange={onChange}
                required
                className="field"
              />
            </Field>
            <Field label="Exact location (help whoever's searching)">
              <textarea
                id="description"
                name="description"
                placeholder="e.g. Top shelf of the black fireproof safe, beside the deed box"
                value={formData.description}
                onChange={onChange}
                rows={3}
                className="field resize-none"
              />
            </Field>
          </Section>

          <Section
            title="Who may see it"
            hint="Stewards see this document immediately. Successors see it only after you release the vault."
          >
            {eligibleMembers.length > 0 && (
              <div className="mb-6">
                <p className="field-label">People already named</p>
                <ul className="border border-border rounded-md divide-y divide-border">
                  {eligibleMembers.map((m) => (
                    <li key={m.id}>
                      <label className="flex items-center gap-3 py-3 px-4 cursor-pointer hover:bg-muted transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedMemberIds.includes(m.id)}
                          onChange={() => toggleMember(m.id)}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="w-9 h-9 rounded-full bg-secondary inline-flex items-center justify-center text-sm font-semibold">
                          {m.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground truncate">{m.name}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {m.email}
                          </p>
                        </div>
                        <span className="text-xs font-medium bg-muted text-muted-foreground rounded px-2 py-0.5">
                          {roleLabel[m.role]}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="field-label">Add someone new</p>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-3">
                <div className="grid grid-cols-2 border border-border rounded-md overflow-hidden">
                  {(["steward", "successor"] as VaultRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setNewRole(r)}
                      className={`py-3 text-sm font-medium transition-colors ${
                        newRole === r
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {roleLabel[r]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="md:col-span-7">
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDraftMember();
                    }
                  }}
                  className="field"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={addDraftMember}
                  className="btn-secondary w-full"
                >
                  <Plus size={16} strokeWidth={1.75} />
                  Add
                </button>
              </div>
            </div>

            {draftMembers.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {draftMembers.map((d) => (
                  <li
                    key={d.email}
                    className="flex items-center gap-2 pl-3 pr-2 py-1.5 bg-secondary border border-border rounded-full text-sm"
                  >
                    <span className="text-xs font-medium text-muted-foreground">
                      {roleLabel[d.role]}
                    </span>
                    <span className="text-foreground">{d.email}</span>
                    <button
                      type="button"
                      onClick={() => removeDraft(d.email)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={`Remove ${d.email}`}
                    >
                      <X size={14} strokeWidth={1.75} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Files are encrypted before they leave your device.
            </p>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full sm:w-auto"
            >
              {isLoading ? "Saving…" : "Save document"}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">{title}</h2>
      {hint && <p className="text-base text-muted-foreground mb-5">{hint}</p>}
      <div className="space-y-4 mt-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

function NativeSelect({
  name,
  value,
  onChange,
  options,
  placeholder,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  placeholder: string;
}) {
  return (
    <div className="relative">
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="field appearance-none pr-10 cursor-pointer"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        ▾
      </span>
    </div>
  );
}
