import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Zone } from "@/components/Zone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/context/AppContext";
import type {
  AccessTiming,
  MemberPermission,
  PlanLimits,
  VaultMember,
  VaultSection,
} from "@/lib/types";
import {
  accessTimingLabel,
  documentLabel,
  planAllowsDocument,
  sectionLabel,
} from "@/lib/permissions";
import { ArrowLeft, Check, Pencil, Plus, Trash2 } from "lucide-react";

export default function Members() {
  const {
    vault,
    permissions,
    addMember,
    updateMember,
    removeMember,
    isAuthenticated,
    loading,
    currentUser,
  } = useApp();
  const navigate = useNavigate();
  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftDateOfBirth, setDraftDateOfBirth] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<MemberPermission[]>(defaultDraftPermissions);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const resetForm = () => {
    setDraftName("");
    setDraftEmail("");
    setDraftDateOfBirth("");
    setDraftPermissions(defaultDraftPermissions());
    setEditingMemberId(null);
    setFormOpen(false);
  };

  const openAddForm = () => {
    setEditingMemberId(null);
    setDraftName("");
    setDraftEmail("");
    setDraftDateOfBirth("");
    setDraftPermissions(defaultDraftPermissions());
    setFormOpen(true);
  };

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) navigate("/login");
    else if (!permissions.isOwner) navigate("/dashboard");
  }, [isAuthenticated, permissions.isOwner, loading, navigate]);

  if (!vault || !permissions.isOwner) return null;

  // One entry per authorized person — a contacts-style list. Each person's
  // cross-section access is shown as chips on their own card, so nobody appears
  // more than once (the old by-section grouping listed a person once per
  // section they touched).
  const authorizedPeople = vault.members.filter((m) => m.role !== "owner");
  const authorizedCount = authorizedPeople.length;
  const maxAuthorizedPeople = currentUser?.planLimits?.maxAuthorizedPeople ?? Infinity;
  const atMemberLimit = authorizedCount >= maxAuthorizedPeople;
  const normalizedDraftPermissions = normalizeDraftPermissions(draftPermissions);
  const primaryPermission = primaryPermissionFrom(normalizedDraftPermissions);
  const primaryRole = primaryPermission?.permissionRole ?? null;
  const formBlocker = memberFormBlocker({
    editing: Boolean(editingMemberId),
    atMemberLimit,
    name: draftName,
    email: draftEmail,
    dateOfBirth: draftDateOfBirth,
    hasPermission: Boolean(primaryRole),
  });
  const canSubmit = !formBlocker;

  const onAdd = async () => {
    if (
      !draftName.trim() ||
      (!editingMemberId && !draftEmail.trim()) ||
      (!editingMemberId && !draftDateOfBirth) ||
      (!editingMemberId && atMemberLimit) ||
      !primaryRole
    ) return;
    if (editingMemberId) {
      await updateMember(editingMemberId, {
        name: draftName.trim(),
        role: primaryRole,
        permissions: normalizedDraftPermissions,
      });
    } else {
      await addMember({
        name: draftName.trim(),
        email: draftEmail.trim(),
        role: primaryRole,
        dateOfBirth: draftDateOfBirth,
        accessTiming: primaryPermission?.accessTiming ?? "now",
        permissions: normalizedDraftPermissions,
      });
    }
    resetForm();
  };

  const memberToRemove =
    vault.members.find((m) => m.id === confirmRemoveId) ?? null;

  const removePerson = async () => {
    if (!memberToRemove) return;
    await removeMember(memberToRemove.id);
    setConfirmRemoveId(null);
  };

  const startEdit = (member: VaultMember) => {
    setEditingMemberId(member.id);
    setDraftName(member.name);
    setDraftEmail(member.email);
    setDraftDateOfBirth(member.dateOfBirth?.slice(0, 10) ?? "");
    setDraftPermissions(member.permissions?.length ? normalizeDraftPermissions(member.permissions) : []);
    setFormOpen(true);
  };

  return (
    <Layout>
      <div className="container py-7 md:py-10 max-w-4xl">
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-2 text-base text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
          Back to vault
        </button>

        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-7">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold mb-2">People</h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Choose who can see each part of your vault, and when. Birthdays
              help match people during manual release review.
            </p>
          </div>
          {Number.isFinite(maxAuthorizedPeople) && (
            <div className="shrink-0 rounded-xl border border-border bg-card px-5 py-3 text-center">
              <p className="text-2xl font-bold tnum leading-none">
                {authorizedCount}
                <span className="text-muted-foreground font-semibold">
                  {" "}/ {maxAuthorizedPeople}
                </span>
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {maxAuthorizedPeople === 1 ? "person" : "people"} used
              </p>
            </div>
          )}
        </header>

        {/* Add-person affordance. The add/edit form itself is a modal. */}
        <div className="mb-9">
          {atMemberLimit ? (
            <div className="card-surface p-5">
              <p className="text-base text-muted-foreground">
                {maxAuthorizedPeople <= 0
                  ? "The Free plan lets you record your own will, but it does not include authorized people."
                  : `You've reached the authorized person limit for the ${
                      currentUser?.planLimits?.name ?? "current"
                    } plan.`}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={openAddForm}
              className="btn-secondary w-full border-dashed !min-h-[56px]"
            >
              <Plus size={18} strokeWidth={1.75} />
              Add authorized person
            </button>
          )}
        </div>

        <Zone title="Authorized people">
          {authorizedPeople.length === 0 ? (
            <div className="card-surface border-dashed p-8 text-center">
              <p className="text-muted-foreground">
                No one else has access to this vault yet.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {authorizedPeople.map((member) => (
                <PersonCard
                  key={member.id}
                  member={member}
                  onEdit={() => startEdit(member)}
                  onRemove={() => setConfirmRemoveId(member.id)}
                />
              ))}
            </ul>
          )}
        </Zone>
      </div>

      {/* Add / edit a person's permissions — a focused modal so the vault
          owner works on one person at a time without losing their place. */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) resetForm();
        }}
      >
        <DialogContent className="card-surface rounded-xl sm:rounded-xl max-w-2xl max-h-[90vh] gap-0 overflow-hidden p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 text-left">
            <DialogTitle className="text-xl">
              {editingMemberId ? "Edit access" : "Add authorized person"}
            </DialogTitle>
            <DialogDescription className="text-base text-muted-foreground">
              Choose exactly what this person can access. Their overall vault
              access is derived from these permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto px-6 py-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="field-label">Name</label>
                <input
                  type="text"
                  placeholder="Michael Mitchell"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">Email</label>
                <input
                  type="email"
                  placeholder="michael@example.com"
                  value={draftEmail}
                  onChange={(e) => setDraftEmail(e.target.value)}
                  className="field"
                  disabled={Boolean(editingMemberId)}
                />
              </div>
              <div>
                <label className="field-label">Birthday</label>
                <input
                  type="date"
                  value={draftDateOfBirth}
                  onChange={(e) => setDraftDateOfBirth(e.target.value)}
                  className="field"
                  disabled={Boolean(editingMemberId)}
                />
              </div>
            </div>

            <PermissionPicker
              permissions={draftPermissions}
              planLimits={currentUser?.planLimits}
              onChange={setDraftPermissions}
            />
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-base text-muted-foreground">
              {formBlocker ?? "Ready to save this person's permissions."}
            </p>
            <div className="flex items-center gap-3 shrink-0">
              <button onClick={resetForm} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={onAdd}
                className="btn-primary sm:min-w-[160px]"
                disabled={!canSubmit}
              >
                {editingMemberId ? (
                  <>
                    <Check size={16} strokeWidth={2} />
                    Save changes
                  </>
                ) : (
                  <>
                    <Plus size={16} strokeWidth={1.75} />
                    Add person
                  </>
                )}
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(memberToRemove)}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveId(null);
        }}
      >
        <AlertDialogContent className="card-surface rounded-xl sm:rounded-xl max-w-md gap-0 p-0 overflow-hidden">
          {memberToRemove && (
            <>
              <AlertDialogHeader className="px-6 pt-6 pb-4 text-left">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <Trash2 size={20} strokeWidth={1.75} />
                  </span>
                  <div>
                    <AlertDialogTitle className="text-xl">
                      Remove {memberToRemove.name}?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-base text-muted-foreground mt-1.5">
                      {memberToRemove.name} will lose all access to this vault.
                      To change only some of their access instead, use Edit.
                      This can't be undone.
                    </AlertDialogDescription>
                  </div>
                </div>
              </AlertDialogHeader>
              <AlertDialogFooter className="px-6 py-4 border-t border-border flex-col-reverse sm:flex-row sm:justify-end gap-3">
                <AlertDialogCancel className="btn-secondary mt-0">
                  Keep access
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={removePerson}
                  className="btn-destructive"
                >
                  Remove person
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

// A permission option is available when the plan includes that option's
// section and allows at least one authorized person. Gating by section (not
// role) is what lets a steward/successor option target a list section.
function permissionOptionAllowedByPlan(
  limits: PlanLimits | null | undefined,
  section: VaultSection,
) {
  if (!limits) return true;
  if (limits.maxAuthorizedPeople <= 0) return false;
  return planAllowsDocument(limits, section);
}

// Sections that use the steward(now) / successor(after-death) model. The will
// and the two list sections behave identically; toggling one of the two roles
// replaces the other for that section.
function isStewardSuccessorSection(documentType: string): boolean {
  return (
    documentType === "will" ||
    documentType === "personal_property" ||
    documentType === "non_probate" ||
    documentType === "funeral" ||
    documentType === "contacts"
  );
}

function PermissionPicker({
  permissions,
  planLimits,
  onChange,
}: {
  permissions: MemberPermission[];
  planLimits: PlanLimits | null | undefined;
  onChange: (permissions: MemberPermission[]) => void;
}) {
  const matchesOption = (p: MemberPermission, option: MemberPermission) =>
    p.documentType === option.documentType &&
    (isStewardSuccessorSection(option.documentType) ||
      p.permissionRole === option.permissionRole);

  const toggle = (permission: MemberPermission) => {
    const exists = permissions.some((p) => matchesOption(p, permission));
    const withoutCurrent = permissions.filter((p) => !matchesOption(p, permission));
    if (exists) {
      onChange(withoutCurrent);
      return;
    }
    // Steward/successor sections allow only one role at a time, so drop any
    // existing permission on the same section before adding the new one.
    const next = isStewardSuccessorSection(permission.documentType)
      ? withoutCurrent.filter((p) => p.documentType !== permission.documentType)
      : withoutCurrent;
    onChange([...next, permission]);
  };
  const update = (permission: MemberPermission, changes: Partial<MemberPermission>) => {
    onChange(
      permissions.map((p) => {
        if (!matchesOption(p, permission)) return p;
        return normalizeDraftPermission({ ...p, ...changes });
      }),
    );
  };
  const options: { label: string; permission: MemberPermission; disabled: boolean }[] = [
    {
      label: `${documentLabel.will} access`,
      permission: { documentType: "will", permissionRole: "steward", accessTiming: "now", hidden: false },
      disabled: !permissionOptionAllowedByPlan(planLimits, "will"),
    },
    {
      label: "Power of Attorney Agent",
      permission: { documentType: "power_of_attorney", permissionRole: "poa_agent", accessTiming: "incapacitated", hidden: false },
      disabled: !permissionOptionAllowedByPlan(planLimits, "power_of_attorney"),
    },
    {
      label: "Health Care Proxy",
      permission: { documentType: "health_care_directive", permissionRole: "health_care_proxy", accessTiming: "incapacitated", hidden: false },
      disabled: !permissionOptionAllowedByPlan(planLimits, "health_care_directive"),
    },
    {
      label: "Personal property access",
      permission: { documentType: "personal_property", permissionRole: "steward", accessTiming: "now", hidden: false },
      disabled: !permissionOptionAllowedByPlan(planLimits, "personal_property"),
    },
    {
      label: "Non-probate assets access",
      permission: { documentType: "non_probate", permissionRole: "steward", accessTiming: "now", hidden: false },
      disabled: !permissionOptionAllowedByPlan(planLimits, "non_probate"),
    },
    {
      label: "Funeral wishes access",
      permission: { documentType: "funeral", permissionRole: "steward", accessTiming: "now", hidden: false },
      disabled: !permissionOptionAllowedByPlan(planLimits, "funeral"),
    },
    {
      label: "Important contacts access",
      permission: { documentType: "contacts", permissionRole: "steward", accessTiming: "now", hidden: false },
      disabled: !permissionOptionAllowedByPlan(planLimits, "contacts"),
    },
  ];

  return (
    <div>
      <label className="field-label">Document permissions</label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {options.map(({ label, permission, disabled }) => {
          const selected = permissions.find((p) => matchesOption(p, permission));
          const timingOptions: AccessTiming[] =
            isStewardSuccessorSection(permission.documentType)
              ? ["now", "after_death"]
              : ["now", "incapacitated"];
          const showHideControl = Boolean(selected);
          return (
            <div
              key={label}
              className={`border rounded-md p-3 bg-card transition-colors ${
                selected ? "border-primary bg-primary/5" : "border-border"
              } ${disabled ? "opacity-50" : ""}`}
            >
              <label className="flex items-center gap-3 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(selected)}
                  disabled={disabled}
                  onChange={() => toggle(permission)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`h-5 w-5 rounded-sm border inline-flex items-center justify-center shrink-0 transition-colors ${
                    selected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border bg-background"
                  }`}
                >
                  {selected && <Check size={14} strokeWidth={2.25} />}
                </span>
                {label}
              </label>
              {selected && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {timingOptions.map((timing) => (
                    <button
                      key={timing}
                      type="button"
                      onClick={() =>
                        update(selected, {
                          accessTiming: timing,
                          hidden: selected.hidden,
                        })
                      }
                      className={`py-2 rounded-md border text-sm ${
                        selected.accessTiming === timing
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {accessTimingLabel[timing]}
                    </button>
                  ))}
                  {showHideControl && (
                    <label
                      className="col-span-2 flex items-center gap-3 text-sm text-muted-foreground cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(selected.hidden)}
                        onChange={(event) => update(selected, { hidden: event.target.checked })}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={`h-5 w-5 rounded-sm border inline-flex items-center justify-center shrink-0 transition-colors ${
                          selected.hidden
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border bg-background"
                        }`}
                      >
                        {selected.hidden && <Check size={14} strokeWidth={2.25} />}
                      </span>
                      Hide this vault access from this person
                    </label>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One authorized person, rendered once regardless of how many sections they
 * can access. Their access is summarised as permission chips. Edit opens the
 * form with all their permissions; Remove takes them off the vault entirely.
 */
function PersonCard({
  member,
  onEdit,
  onRemove,
}: {
  member: VaultMember;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const permissions = member.permissions ?? [];
  return (
    <li className="card-surface p-5 flex flex-col sm:flex-row sm:items-start gap-4">
      <span className="w-12 h-12 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center text-lg font-semibold shrink-0">
        {member.name.charAt(0).toUpperCase()}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-lg font-semibold text-foreground truncate">
            {member.name}
          </p>
          {!member.userId && (
            <span className="inline-flex items-center rounded-full bg-accent/15 text-accent px-2.5 py-0.5 text-sm font-semibold">
              Pending signup
            </span>
          )}
        </div>
        <p className="text-base text-muted-foreground truncate">{member.email}</p>
        <p className="text-base text-muted-foreground">
          {member.dateOfBirth
            ? `Born ${formatBirthday(member.dateOfBirth)}`
            : "Birthday not recorded"}
        </p>

        <div className="mt-3">
          <p className="text-sm font-semibold text-muted-foreground mb-2">
            Can access
          </p>
          {permissions.length ? (
            <div className="flex flex-wrap gap-2">
              {permissions.map((p) => (
                <PermissionChip
                  key={`${p.documentType}-${p.permissionRole}`}
                  permission={p}
                />
              ))}
            </div>
          ) : (
            <p className="text-base text-muted-foreground">No access yet.</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-start">
        <button
          onClick={onEdit}
          className="btn-secondary !min-h-[40px] !text-sm"
        >
          <Pencil size={15} strokeWidth={1.75} />
          Edit
        </button>
        <button
          onClick={onRemove}
          className="p-2.5 text-muted-foreground hover:text-destructive transition-colors rounded-lg border border-transparent hover:border-border"
          aria-label={`Remove ${member.name} from the vault`}
        >
          <Trash2 size={18} strokeWidth={1.75} />
        </button>
      </div>
    </li>
  );
}

/**
 * A single permission rendered as a compact chip: the section, the timing, and
 * a lock hint when the access is hidden from the person. Replaces the old
 * run-on "·"-joined summary string so a member's access is scannable.
 */
function PermissionChip({ permission }: { permission: MemberPermission }) {
  const section = sectionLabel[permission.documentType] ?? permission.documentType;
  const timing = accessTimingLabel[permission.accessTiming];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1 text-sm font-medium text-foreground">
      <span className="font-semibold">{section}</span>
      <span className="text-muted-foreground">· {timing}</span>
      {permission.hidden && <span className="text-muted-foreground">· hidden</span>}
    </span>
  );
}

function formatBirthday(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

function memberFormBlocker({
  editing,
  atMemberLimit,
  name,
  email,
  dateOfBirth,
  hasPermission,
}: {
  editing: boolean;
  atMemberLimit: boolean;
  name: string;
  email: string;
  dateOfBirth: string;
  hasPermission: boolean;
}) {
  if (!editing && atMemberLimit) return "Your current plan has reached its authorized person limit.";
  if (!name.trim()) return "Enter the person's name to continue.";
  if (!editing && !email.trim()) return "Enter the person's email to continue.";
  if (!editing && !dateOfBirth) return "Enter the person's birthday to continue.";
  if (!hasPermission) return "Select at least one document permission to continue.";
  return null;
}

function defaultDraftPermissions(): MemberPermission[] {
  return [];
}

function normalizeDraftPermissions(permissions: MemberPermission[]) {
  let selectedWill: MemberPermission | null = null;
  const out: MemberPermission[] = [];
  for (const permission of permissions) {
    const normalized = normalizeDraftPermission(permission);
    if (normalized.documentType === "will") {
      selectedWill = normalized;
      continue;
    }
    out.push(normalized);
  }
  return selectedWill ? [selectedWill, ...out] : out;
}

function normalizeDraftPermission(permission: MemberPermission): MemberPermission {
  if (!isStewardSuccessorSection(permission.documentType)) {
    return permission;
  }
  const accessTiming =
    permission.accessTiming === "after_death" ? "after_death" : "now";
  return {
    ...permission,
    permissionRole: accessTiming === "after_death" ? "successor" : "steward",
    accessTiming,
    hidden: permission.hidden,
  };
}

function primaryPermissionFrom(permissions: MemberPermission[]) {
  return (
    permissions.find((p) => p.permissionRole === "steward") ??
    permissions.find(
      (p) =>
        (p.permissionRole === "poa_agent" ||
          p.permissionRole === "health_care_proxy") &&
        p.accessTiming === "now",
    ) ??
    permissions.find((p) => p.permissionRole === "successor") ??
    permissions[0] ??
    null
  );
}
