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

  // Owner-only page.
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

  // Existing members (stewards + successors) who can be granted access.
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

    // Create any newly-typed members first, collecting IDs as we go.
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
      <div className="container py-10 md:py-14 max-w-3xl">
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-2 text-[15px] text-ink-muted hover:text-ink transition-colors mb-10"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
          Back to the vault
        </button>

        <header className="mb-12 fade-in-up">
          <p className="eyebrow mb-5">A new entry</p>
          <h1 className="display-serif text-5xl md:text-6xl leading-[0.98] text-balance">
            Record a paper <br />
            <span className="italic-serif text-seal">for the record.</span>
          </h1>
          <p className="mt-5 text-lg text-ink-muted max-w-xl">
            Tell us what it is, where you keep the original, and whom we may
            tell about it.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="space-y-14 paper-card p-8 md:p-12 fade-in-up delay-200"
          style={{ borderRadius: "2px" }}
        >
          <Section number="I" title="The paper itself">
            <Field label="Kind of document">
              <NativeSelect
                name="type"
                value={formData.type}
                onChange={(v) => setFormData({ ...formData, type: v as DocumentType })}
                options={Object.entries(documentTypeLabels)}
                placeholder="Select a kind…"
              />
            </Field>
            <Field label="How you would call it">
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

          <div className="rule-dotted" />

          <Section number="II" title="A digital copy, if you have one">
            <label
              htmlFor="file"
              className="block border border-dashed border-hairline px-8 py-12 text-center cursor-pointer hover:bg-paper-alt/50 hover:border-ink transition-colors"
              style={{ borderRadius: "2px" }}
            >
              <input
                type="file"
                id="file"
                accept=".pdf,.jpg,.jpeg,.png,.heic"
                onChange={onFileChange}
                className="hidden"
              />
              <Upload size={28} strokeWidth={1.25} className="mx-auto text-ink-muted mb-4" />
              {fileName ? (
                <div>
                  <p className="font-serif text-xl">{fileName}</p>
                  <p className="italic-serif text-ink-subtle mt-1">
                    Ready to seal. Click to choose another.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-ink text-[17px]">
                    Click here to choose a PDF, photograph, or scan.
                  </p>
                  <p className="italic-serif text-ink-subtle mt-1">
                    Optional — you may record this paper without uploading.
                  </p>
                </div>
              )}
            </label>
          </Section>

          <div className="rule-dotted" />

          <Section number="III" title="Where the original rests">
            <Field label="Kind of place">
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
            <Field label="Exactly where (a description that will help the one searching)">
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

          <div className="rule-dotted" />

          <Section number="IV" title="Who may know of it">
            <p className="italic-serif text-ink-muted -mt-2 mb-6">
              Grant access to people you've already named, or add new ones
              below. Stewards see this document immediately; successors only
              after you release the vault.
            </p>

            {eligibleMembers.length > 0 && (
              <div className="mb-6">
                <p className="field-label">Already named</p>
                <ul className="divide-y divide-hairline-soft border-y border-hairline-soft">
                  {eligibleMembers.map((m) => (
                    <li key={m.id}>
                      <label className="flex items-center gap-4 py-3 cursor-pointer hover:bg-paper-sunk/30 px-2 -mx-2 transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedMemberIds.includes(m.id)}
                          onChange={() => toggleMember(m.id)}
                          className="w-4 h-4 accent-seal"
                        />
                        <span
                          className="seal-mark"
                          style={{ width: 32, height: 32, fontSize: 14 }}
                        >
                          {m.name.charAt(0)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-ink truncate">{m.name}</p>
                          <p className="text-sm text-ink-subtle truncate">
                            {m.email}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 rounded-sm ${
                            m.role === "steward"
                              ? "bg-seal-soft text-seal border border-seal/20"
                              : "bg-paper-sunk text-ink-muted border border-hairline"
                          }`}
                        >
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
                <div
                  className="grid grid-cols-2 border border-hairline"
                  style={{ borderRadius: "2px" }}
                >
                  {(["steward", "successor"] as VaultRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setNewRole(r)}
                      className={`py-3 text-[13px] tracking-[0.08em] uppercase transition-colors ${
                        newRole === r
                          ? "bg-ink text-paper"
                          : "text-ink-muted hover:bg-paper-sunk/40"
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
                  className="btn-ghost w-full !min-h-[48px] !py-2"
                >
                  <Plus size={16} strokeWidth={1.5} />
                  Add
                </button>
              </div>
            </div>

            {draftMembers.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {draftMembers.map((d) => (
                  <li
                    key={d.email}
                    className="flex items-center gap-2 pl-4 pr-2 py-2 bg-seal-soft border border-seal/20 text-ink text-sm"
                    style={{ borderRadius: "2px" }}
                  >
                    <span className="text-[10px] tracking-[0.15em] uppercase mr-1 text-seal">
                      {roleLabel[d.role]}
                    </span>
                    <span>{d.email}</span>
                    <button
                      type="button"
                      onClick={() => removeDraft(d.email)}
                      className="text-ink-muted hover:text-seal transition-colors"
                      aria-label={`Remove ${d.email}`}
                    >
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <div className="rule" />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="italic-serif text-ink-subtle text-sm">
              Entries are encrypted before they leave your device.
            </p>
            <button type="submit" disabled={isLoading} className="btn-ink w-full sm:w-auto">
              {isLoading ? "Sealing the entry…" : "Seal this entry"}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-4 mb-6">
        <span
          className="font-serif text-seal text-3xl tnum"
          style={{ fontVariationSettings: "'opsz' 96" }}
        >
          {number}.
        </span>
        <h2 className="font-serif text-2xl tracking-tight">{title}</h2>
      </div>
      <div className="space-y-6 pl-0 md:pl-10">{children}</div>
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
        className="field appearance-none pr-8 cursor-pointer bg-transparent"
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
      <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-ink-muted text-sm">
        ▾
      </span>
    </div>
  );
}
