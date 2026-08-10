import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { contactRoleLabel, nonProbateAssetLabel } from "@/lib/permissions";
import type {
  ContactRole,
  ListSection as ListSectionKind,
  NonProbateAssetType,
  VaultEntry,
  VaultEntryBeneficiary,
} from "@/lib/types";
import { Lock, Pencil, Plus, Trash2, Users, X } from "lucide-react";

/**
 * A field shown on an entry. `key` is where the value lives inside the entry's
 * `details` JSON. `type` picks the input control.
 */
interface FieldSpec {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "textarea" | "asset" | "contactRole";
}

interface SectionConfig {
  section: ListSectionKind;
  title: string;
  intro: string;
  emptyOwner: string;
  emptyReader: string;
  addLabel: string;
  titleLabel: string;
  titlePlaceholder: string;
  fields: FieldSpec[];
  // Contacts don't have beneficiaries; property and assets do.
  showBeneficiaries: boolean;
}

const PERSONAL_PROPERTY: SectionConfig = {
  section: "personal_property",
  title: "Personal property",
  intro: "Specific belongings and who should receive each one.",
  emptyOwner: "You haven't listed any belongings yet.",
  emptyReader: "No belongings have been listed.",
  addLabel: "Add an item",
  titleLabel: "Item",
  titlePlaceholder: "e.g. Grandmother's wedding ring",
  fields: [
    { key: "description", label: "Description", placeholder: "What it is, distinguishing details" },
    { key: "location", label: "Where it's kept", placeholder: "e.g. Jewelry box, bedroom dresser" },
    { key: "value", label: "Approximate value", placeholder: "Optional" },
  ],
  showBeneficiaries: true,
};

const NON_PROBATE: SectionConfig = {
  section: "non_probate",
  title: "Non-probate assets",
  intro:
    "Assets that pass outside the will by their own beneficiary designation or survivorship. Listing them here is a record — it does not change who is designated.",
  emptyOwner: "You haven't listed any non-probate assets yet.",
  emptyReader: "No non-probate assets have been listed.",
  addLabel: "Add an asset",
  titleLabel: "Asset",
  titlePlaceholder: "e.g. MetLife term life policy",
  fields: [
    { key: "assetType", label: "Asset type", type: "asset" },
    { key: "institution", label: "Institution", placeholder: "e.g. MetLife, Fidelity" },
    { key: "reference", label: "Account / policy reference", placeholder: "e.g. Policy #, last 4 of account" },
    { key: "ownership", label: "Ownership form", placeholder: "e.g. Individual, JTWROS" },
    { key: "notes", label: "Notes", placeholder: "Optional", type: "textarea" },
  ],
  showBeneficiaries: true,
};

const CONTACTS: SectionConfig = {
  section: "contacts",
  title: "Important contacts",
  intro:
    "The people a steward or successor may need to reach — attorney, advisor, executor, and key family.",
  emptyOwner: "You haven't added any contacts yet.",
  emptyReader: "No contacts have been added.",
  addLabel: "Add a contact",
  titleLabel: "Name",
  titlePlaceholder: "e.g. Sarah Reed",
  fields: [
    { key: "role", label: "Role", type: "contactRole" },
    { key: "organization", label: "Organization", placeholder: "e.g. Reed & Kane, Esq." },
    { key: "phone", label: "Phone", placeholder: "Optional" },
    { key: "email", label: "Email", placeholder: "Optional" },
    { key: "notes", label: "Notes", placeholder: "Optional", type: "textarea" },
  ],
  showBeneficiaries: false,
};

const LIST_SECTION_CONFIG: Record<ListSectionKind, SectionConfig> = {
  personal_property: PERSONAL_PROPERTY,
  non_probate: NON_PROBATE,
  contacts: CONTACTS,
};

const ASSET_TYPES = Object.keys(nonProbateAssetLabel) as NonProbateAssetType[];
const CONTACT_ROLES = Object.keys(contactRoleLabel) as ContactRole[];

function detailValue(entry: VaultEntry, key: string): string {
  const value = entry.details?.[key];
  return typeof value === "string" ? value : "";
}

/**
 * A vault list section (personal property or non-probate assets). Owners can
 * add, edit, and remove entries and their beneficiaries; permitted viewers see
 * a read-only list. The whole section is gated upstream — a viewer who may not
 * read it never receives its entries, so nothing here needs to hide names.
 */
export function ListSection({
  section,
  entries,
  canEdit,
}: {
  section: ListSectionKind;
  entries: VaultEntry[];
  canEdit: boolean;
}) {
  const config = LIST_SECTION_CONFIG[section];
  const [adding, setAdding] = useState(false);

  return (
    <section className="card-surface p-5 md:p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-xl font-semibold">{config.title}</h2>
        {canEdit && !adding && entries.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn-secondary !min-h-[36px] !text-sm"
          >
            <Plus size={14} strokeWidth={1.75} />
            {config.addLabel}
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">{config.intro}</p>

      {entries.length === 0 && !adding ? (
        <div>
          <p className="text-muted-foreground mb-4">
            {canEdit ? config.emptyOwner : config.emptyReader}
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="btn-primary"
            >
              <Plus size={18} strokeWidth={1.75} />
              {config.addLabel}
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              config={config}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-4">
          <EntryForm
            section={section}
            config={config}
            sortOrder={entries.length}
            onDone={() => setAdding(false)}
          />
        </div>
      )}
    </section>
  );
}

function EntryRow({
  entry,
  config,
  canEdit,
}: {
  entry: VaultEntry;
  config: SectionConfig;
  canEdit: boolean;
}) {
  const { removeEntry } = useApp();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (editing) {
    return (
      <li>
        <EntryForm
          section={config.section}
          config={config}
          entry={entry}
          sortOrder={entry.sortOrder}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  let subtitle: string | null = null;
  if (config.section === "non_probate") {
    const assetType = detailValue(entry, "assetType") as NonProbateAssetType;
    subtitle = nonProbateAssetLabel[assetType] ?? null;
  } else if (config.section === "contacts") {
    const role = detailValue(entry, "role") as ContactRole;
    subtitle = contactRoleLabel[role] ?? null;
  }

  return (
    <li className="rounded-md border border-border/60 bg-secondary/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-medium text-foreground">{entry.title}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`Edit ${entry.title}`}
            >
              <Pencil size={16} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              disabled={removing}
              onClick={async () => {
                if (!window.confirm(`Remove "${entry.title}"?`)) return;
                setRemoving(true);
                try {
                  await removeEntry(entry.id);
                } finally {
                  setRemoving(false);
                }
              }}
              className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
              aria-label={`Remove ${entry.title}`}
            >
              <Trash2 size={16} strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>

      <dl className="mt-2 space-y-1.5">
        {config.fields
          .filter(
            (f) =>
              f.type !== "asset" &&
              f.type !== "contactRole" &&
              detailValue(entry, f.key),
          )
          .map((f) => (
            <div key={f.key} className="grid grid-cols-[9rem_1fr] gap-2 text-sm">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="text-foreground break-words">{detailValue(entry, f.key)}</dd>
            </div>
          ))}
      </dl>

      {config.showBeneficiaries && entry.beneficiaries.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/60">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
            <Users size={13} strokeWidth={1.75} />
            Beneficiaries
          </p>
          <ul className="space-y-1">
            {entry.beneficiaries.map((b) => (
              <li key={b.id ?? b.name} className="text-sm text-foreground">
                <span className="font-medium">{b.name}</span>
                {b.relationship && (
                  <span className="text-muted-foreground"> · {b.relationship}</span>
                )}
                {b.share && <span className="text-muted-foreground"> · {b.share}</span>}
                {b.note && <span className="text-muted-foreground"> — {b.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

interface BeneficiaryDraft extends VaultEntryBeneficiary {
  _key: string;
}

function newBeneficiary(): BeneficiaryDraft {
  return {
    _key: `ben-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    relationship: "",
    share: "",
    note: "",
  };
}

function EntryForm({
  section,
  config,
  entry,
  sortOrder,
  onDone,
}: {
  section: ListSectionKind;
  config: SectionConfig;
  entry?: VaultEntry;
  sortOrder: number;
  onDone: () => void;
}) {
  const { addEntry, updateEntry } = useApp();
  const [title, setTitle] = useState(entry?.title ?? "");
  const [details, setDetails] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of config.fields) initial[f.key] = entry ? detailValue(entry, f.key) : "";
    if (section === "non_probate" && !initial.assetType) initial.assetType = "life_insurance";
    if (section === "contacts" && !initial.role) initial.role = "attorney";
    return initial;
  });
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryDraft[]>(() =>
    entry && entry.beneficiaries.length > 0
      ? entry.beneficiaries.map((b, i) => ({ ...b, _key: b.id ?? `ben-${i}` }))
      : [newBeneficiary()],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (key: string, value: string) =>
    setDetails((d) => ({ ...d, [key]: value }));

  const setBen = (key: string, changes: Partial<VaultEntryBeneficiary>) =>
    setBeneficiaries((list) =>
      list.map((b) => (b._key === key ? { ...b, ...changes } : b)),
    );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const cleanDetails: Record<string, string> = {};
    for (const [k, val] of Object.entries(details)) {
      if (val.trim() !== "") cleanDetails[k] = val.trim();
    }
    const cleanBeneficiaries = beneficiaries
      .filter((b) => b.name.trim() !== "")
      .map((b, i) => ({
        id: b.id,
        name: b.name.trim(),
        relationship: b.relationship?.trim() ?? "",
        share: b.share?.trim() ?? "",
        note: b.note?.trim() ?? "",
        sortOrder: i,
      }));
    const payload = {
      section,
      title: title.trim(),
      details: cleanDetails,
      sortOrder,
      beneficiaries: cleanBeneficiaries,
    };
    try {
      if (entry) await updateEntry(entry.id, payload);
      else await addEntry(payload);
      onDone();
    } catch {
      setError("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-md border border-primary/40 bg-primary/5 p-4 space-y-4"
    >
      <div>
        <label htmlFor={`title-${section}`} className="field-label">
          {config.titleLabel}
        </label>
        <input
          id={`title-${section}`}
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={config.titlePlaceholder}
          className="field"
        />
      </div>

      {config.fields.map((f) =>
        f.type === "asset" || f.type === "contactRole" ? (
          <div key={f.key}>
            <label htmlFor={`f-${f.key}`} className="field-label">
              {f.label}
            </label>
            <select
              id={`f-${f.key}`}
              value={details[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
              className="field"
            >
              {f.type === "asset"
                ? ASSET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {nonProbateAssetLabel[t]}
                    </option>
                  ))
                : CONTACT_ROLES.map((t) => (
                    <option key={t} value={t}>
                      {contactRoleLabel[t]}
                    </option>
                  ))}
            </select>
          </div>
        ) : f.type === "textarea" ? (
          <div key={f.key}>
            <label htmlFor={`f-${f.key}`} className="field-label">
              {f.label}
            </label>
            <textarea
              id={`f-${f.key}`}
              rows={2}
              value={details[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="field resize-none"
            />
          </div>
        ) : (
          <div key={f.key}>
            <label htmlFor={`f-${f.key}`} className="field-label">
              {f.label}
            </label>
            <input
              id={`f-${f.key}`}
              type="text"
              value={details[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="field"
            />
          </div>
        ),
      )}

      {config.showBeneficiaries && (
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="field-label !mb-0 flex items-center gap-1.5">
            <Users size={14} strokeWidth={1.75} />
            Beneficiaries
          </span>
          <button
            type="button"
            onClick={() => setBeneficiaries((l) => [...l, newBeneficiary()])}
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            <Plus size={14} strokeWidth={1.75} />
            Add
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
          <Lock size={12} strokeWidth={1.75} />
          Names stay private until you permit someone to see this section.
        </p>
        <div className="space-y-3">
          {beneficiaries.map((b) => (
            <div
              key={b._key}
              className="rounded-md border border-border bg-background p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={b.name}
                  onChange={(e) => setBen(b._key, { name: e.target.value })}
                  placeholder="Beneficiary name"
                  className="field !mb-0 flex-1"
                />
                {beneficiaries.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setBeneficiaries((l) => l.filter((x) => x._key !== b._key))
                    }
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Remove beneficiary"
                  >
                    <X size={16} strokeWidth={1.75} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={b.relationship ?? ""}
                  onChange={(e) => setBen(b._key, { relationship: e.target.value })}
                  placeholder="Relationship"
                  className="field !mb-0"
                />
                <input
                  type="text"
                  value={b.share ?? ""}
                  onChange={(e) => setBen(b._key, { share: e.target.value })}
                  placeholder="Share (e.g. 50%)"
                  className="field !mb-0"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="btn-secondary"
          disabled={saving}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : entry ? "Save" : `Add`}
        </button>
      </div>
    </form>
  );
}
