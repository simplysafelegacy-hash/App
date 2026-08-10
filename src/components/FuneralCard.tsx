import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import type { FuneralDisposition, FuneralWishes } from "@/lib/types";
import { Pencil, Plus } from "lucide-react";

const DISPOSITIONS: { value: FuneralDisposition; label: string }[] = [
  { value: "burial", label: "Burial" },
  { value: "cremation", label: "Cremation" },
  { value: "donation", label: "Body donation" },
  { value: "undecided", label: "Undecided" },
];

const dispositionLabel: Record<string, string> = {
  burial: "Burial",
  cremation: "Cremation",
  donation: "Body donation",
  undecided: "Undecided",
};

const DETAIL_FIELDS: { key: keyof FuneralWishes; label: string }[] = [
  { key: "serviceWishes", label: "Service wishes" },
  { key: "serviceLocation", label: "Service location" },
  { key: "officiant", label: "Officiant" },
  { key: "readingsMusic", label: "Readings & music" },
  { key: "prepaidProvider", label: "Prepaid plan / provider" },
  { key: "notes", label: "Notes" },
];

/**
 * The owner's funeral & burial wishes — a single record per vault. Owners can
 * record and edit; permitted viewers see a read-only summary. Gated upstream
 * as the 'funeral' section, so a sealed viewer never receives this card.
 */
export function FuneralCard({
  funeral,
  canEdit,
  lockedMessage,
}: {
  funeral: FuneralWishes;
  canEdit: boolean;
  lockedMessage?: string;
}) {
  const { updateFuneralWishes } = useApp();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<FuneralWishes>(funeral);

  useEffect(() => setDraft(funeral), [funeral]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateFuneralWishes({
        hasFuneral: true,
        disposition: draft.disposition || "",
        serviceWishes: draft.serviceWishes,
        serviceLocation: draft.serviceLocation,
        officiant: draft.officiant,
        readingsMusic: draft.readingsMusic,
        prepaidProvider: draft.prepaidProvider,
        notes: draft.notes,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const set = (changes: Partial<FuneralWishes>) =>
    setDraft((d) => ({ ...d, ...changes }));

  return (
    <section className="card-surface p-5 md:p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xl font-semibold">Funeral &amp; burial wishes</h2>
        {canEdit && !editing && funeral.hasFuneral && (
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
        funeral.hasFuneral ? (
          <dl className="space-y-3">
            {funeral.disposition && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Disposition</dt>
                <dd className="text-sm text-foreground">
                  {dispositionLabel[funeral.disposition] ?? funeral.disposition}
                </dd>
              </div>
            )}
            {DETAIL_FIELDS.map(({ key, label }) => {
              const value = funeral[key];
              if (typeof value !== "string" || value === "") return null;
              return (
                <div key={key}>
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="text-sm text-foreground whitespace-pre-wrap">{value}</dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <div>
            <p className="text-muted-foreground mb-4">
              {canEdit || lockedMessage
                ? "You haven't recorded your funeral wishes yet."
                : "Funeral wishes have not been recorded."}
            </p>
            {lockedMessage && (
              <p className="text-sm text-muted-foreground mb-4">{lockedMessage}</p>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  set({ hasFuneral: true });
                  setEditing(true);
                }}
                className="btn-primary"
              >
                <Plus size={18} strokeWidth={1.75} />
                Record your wishes
              </button>
            )}
          </div>
        )
      ) : (
        <form onSubmit={onSave} className="space-y-5">
          <div>
            <label htmlFor="disposition" className="field-label">
              Disposition
            </label>
            <select
              id="disposition"
              value={draft.disposition ?? ""}
              onChange={(e) =>
                set({ disposition: e.target.value as FuneralDisposition })
              }
              className="field"
            >
              <option value="">Select…</option>
              {DISPOSITIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="serviceWishes" className="field-label">
              Service wishes
            </label>
            <textarea
              id="serviceWishes"
              rows={2}
              value={draft.serviceWishes}
              onChange={(e) => set({ serviceWishes: e.target.value })}
              placeholder="e.g. Small graveside gathering, no formal service"
              className="field resize-none"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="serviceLocation" className="field-label">
                Service location
              </label>
              <input
                id="serviceLocation"
                type="text"
                value={draft.serviceLocation}
                onChange={(e) => set({ serviceLocation: e.target.value })}
                className="field"
              />
            </div>
            <div>
              <label htmlFor="officiant" className="field-label">
                Officiant
              </label>
              <input
                id="officiant"
                type="text"
                value={draft.officiant}
                onChange={(e) => set({ officiant: e.target.value })}
                className="field"
              />
            </div>
          </div>

          <div>
            <label htmlFor="readingsMusic" className="field-label">
              Readings &amp; music
            </label>
            <input
              id="readingsMusic"
              type="text"
              value={draft.readingsMusic}
              onChange={(e) => set({ readingsMusic: e.target.value })}
              className="field"
            />
          </div>

          <div>
            <label htmlFor="prepaidProvider" className="field-label">
              Prepaid plan / provider
            </label>
            <input
              id="prepaidProvider"
              type="text"
              value={draft.prepaidProvider}
              onChange={(e) => set({ prepaidProvider: e.target.value })}
              placeholder="Plot or plan provider and reference, if any"
              className="field"
            />
          </div>

          <div>
            <label htmlFor="funeralNotes" className="field-label">
              Notes
            </label>
            <textarea
              id="funeralNotes"
              rows={2}
              value={draft.notes}
              onChange={(e) => set({ notes: e.target.value })}
              className="field resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setDraft(funeral);
                setEditing(false);
              }}
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
