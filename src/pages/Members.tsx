import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useApp } from "@/context/AppContext";
import type {
  AccessTiming,
  MemberPermission,
  PlanLimits,
  VaultMember,
  VaultRole,
} from "@/lib/types";
import {
  accessTimingLabel,
  documentLabel,
  planAllowsDocument,
  roleLabel,
} from "@/lib/permissions";
import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react";

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
  const formRef = useRef<HTMLElement>(null);
  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftDateOfBirth, setDraftDateOfBirth] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<MemberPermission[]>(defaultDraftPermissions);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<PermissionRemoval | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) navigate("/login");
    else if (!permissions.isOwner) navigate("/dashboard");
  }, [isAuthenticated, permissions.isOwner, loading, navigate]);

  if (!vault || !permissions.isOwner) return null;

  const stewards = vault.members.filter((m) => hasPermissionRole(m, "steward"));
  const successors = vault.members.filter((m) => hasPermissionRole(m, "successor"));
  const poaAgents = vault.members.filter((m) => hasPermissionRole(m, "poa_agent"));
  const healthCareProxies = vault.members.filter((m) => hasPermissionRole(m, "health_care_proxy"));
  const authorizedCount = vault.members.filter((m) => m.role !== "owner").length;
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
    setDraftName("");
    setDraftEmail("");
    setDraftDateOfBirth("");
    setDraftPermissions(defaultDraftPermissions());
    setEditingMemberId(null);
  };

  const memberToRemove =
    vault.members.find((m) => m.id === confirmRemove?.memberId) ?? null;
  const permissionToRemove =
    memberToRemove && confirmRemove
      ? memberToRemove.permissions?.find((p) => p.permissionRole === confirmRemove.role) ?? null
      : null;
  const remainingPermissions =
    memberToRemove && confirmRemove
      ? permissionsWithoutRole(memberToRemove, confirmRemove.role)
      : [];
  const removingLastPermission = Boolean(memberToRemove && remainingPermissions.length === 0);

  const removePermissionOrMember = async () => {
    if (!confirmRemove || !memberToRemove) return;
    if (remainingPermissions.length === 0) {
      await removeMember(confirmRemove.memberId);
      setConfirmRemove(null);
      return;
    }
    const nextPrimary = primaryPermissionFrom(remainingPermissions);
    await updateMember(confirmRemove.memberId, {
      name: memberToRemove.name,
      role: nextPrimary?.permissionRole ?? memberToRemove.role,
      permissions: remainingPermissions,
    });
    setConfirmRemove(null);
  };

  const startEdit = (member: VaultMember) => {
    setEditingMemberId(member.id);
    setDraftName(member.name);
    setDraftEmail(member.email);
    setDraftDateOfBirth(member.dateOfBirth?.slice(0, 10) ?? "");
    setDraftPermissions(member.permissions?.length ? normalizeDraftPermissions(member.permissions) : []);
    window.requestAnimationFrame(() => {
      const top =
        (formRef.current?.getBoundingClientRect().top ?? 0) +
        window.scrollY -
        112;
      window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
    });
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

        <header className="mb-7">
          <h1 className="text-2xl md:text-3xl font-semibold mb-2">People</h1>
          <p className="text-base text-muted-foreground max-w-2xl">
            Add authorized people by document. Birthdays help match people
            during manual release review.
          </p>
        </header>

        <section ref={formRef} className="card-surface p-5 md:p-6 mb-9">
          <h2 className="text-lg font-semibold mb-1">
            {editingMemberId ? "Edit permissions" : "Add authorized person"}
          </h2>
          <p className="text-sm text-muted-foreground mb-5">
            Choose exactly what this person can access. Their overall vault
            access is derived from these permissions.
            {Number.isFinite(maxAuthorizedPeople) && (
              <>
                {" "}
                Your plan allows {maxAuthorizedPeople} authorized{" "}
                {maxAuthorizedPeople === 1 ? "person" : "people"}.
              </>
            )}
          </p>
          {atMemberLimit && (
            <div className="border border-border bg-secondary/30 rounded-md p-4 mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {maxAuthorizedPeople <= 0
                  ? "The Free plan lets you record your own will, but it does not include authorized people."
                  : `You have reached the authorized person limit for the ${
                      currentUser?.planLimits?.name ?? "current"
                    } plan.`}
              </p>
              <Link to="/plans" className="btn-secondary !min-h-[36px] !text-sm shrink-0">
                Choose a plan
              </Link>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
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
            <div className="md:col-span-3">
              <label className="field-label">Birthday</label>
              <input
                type="date"
                value={draftDateOfBirth}
                onChange={(e) => setDraftDateOfBirth(e.target.value)}
                className="field"
              />
            </div>
            <div className="md:col-span-12">
              <PermissionPicker
                permissions={draftPermissions}
                planLimits={currentUser?.planLimits}
                onChange={setDraftPermissions}
              />
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {formBlocker ?? "Ready to save this person's permissions."}
            </p>
            <button
              onClick={onAdd}
              className="btn-primary sm:min-w-[180px]"
              disabled={!canSubmit}
            >
              <Plus size={16} strokeWidth={1.75} />
              {editingMemberId ? "Save changes" : "Add person"}
            </button>
          </div>
        </section>

        <DocumentSection
          title="Will"
          description="People connected to the will can be active stewards or successor recipients, but not both."
          groups={[
            {
              title: "Stewards",
              description: "Active access to will details.",
              members: stewards,
              role: "steward",
            },
            {
              title: "Successors",
              description: vault.releasedAt
                ? "The will has been released — successors now have access."
                : "Sealed until release is approved.",
              members: successors,
              role: "successor",
            },
          ]}
          onEdit={startEdit}
          onRemove={(memberId, role) => setConfirmRemove({ memberId, role })}
        />

        <div className="h-8" />

        <Section
          title="Power of Attorney Agents"
          description="Access to power of attorney details now or after incapacity is verified."
          members={poaAgents}
          onEdit={startEdit}
          role="poa_agent"
          onRemove={(memberId, role) => setConfirmRemove({ memberId, role })}
        />

        <div className="h-8" />

        <Section
          title="Health Care Proxies"
          description="Access to health care directive details now or after incapacity is verified."
          members={healthCareProxies}
          onEdit={startEdit}
          role="health_care_proxy"
          onRemove={(memberId, role) => setConfirmRemove({ memberId, role })}
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
            <h3 className="text-xl font-semibold mb-3">
              {removingLastPermission
                ? `Remove ${memberToRemove.name}?`
                : `Remove ${roleLabel[confirmRemove.role]}?`}
            </h3>
            <p className="text-muted-foreground mb-6">
              {removingLastPermission
                ? "This is their last permission, so they will be removed from the vault."
                : `${memberToRemove.name} will keep their other permissions. This removes only ${
                    permissionToRemove ? permissionSummary(permissionToRemove) : roleLabel[confirmRemove.role]
                  }.`}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmRemove(null)}
                className="btn-secondary"
              >
                Keep access
              </button>
              <button
                onClick={removePermissionOrMember}
                className="btn-destructive"
              >
                {removingLastPermission ? "Remove person" : "Remove permission"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

type PermissionRemoval = {
  memberId: string;
  role: VaultRole;
};

function permissionAllowedByPlan(
  limits: PlanLimits | null | undefined,
  role: VaultRole,
) {
  if (!limits) return true;
  if (limits.maxAuthorizedPeople <= 0) return false;
  if (role === "steward") return planAllowsDocument(limits, "will");
  if (role === "poa_agent") return planAllowsDocument(limits, "power_of_attorney");
  if (role === "health_care_proxy") return planAllowsDocument(limits, "health_care_directive");
  if (role === "successor") return planAllowsDocument(limits, "will");
  return true;
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
  const toggle = (permission: MemberPermission) => {
    const exists = permissions.some(
      (p) =>
        p.documentType === permission.documentType &&
        (permission.documentType === "will" ||
          p.permissionRole === permission.permissionRole),
    );
    const withoutCurrent = permissions.filter(
      (p) =>
        !(
          p.documentType === permission.documentType &&
          (permission.documentType === "will" ||
            p.permissionRole === permission.permissionRole)
        ),
    );
    if (exists) {
      onChange(withoutCurrent);
      return;
    }
    const next =
      permission.documentType === "will"
        ? withoutCurrent.filter((p) => p.documentType !== "will")
        : withoutCurrent;
    onChange([...next, permission]);
  };
  const update = (permission: MemberPermission, changes: Partial<MemberPermission>) => {
    onChange(
      permissions.map((p) => {
        const matches =
          p.documentType === permission.documentType &&
          (permission.documentType === "will" ||
            p.permissionRole === permission.permissionRole);
        if (!matches) return p;
        return normalizeDraftPermission({ ...p, ...changes });
      }),
    );
  };
  const options: { label: string; permission: MemberPermission; disabled: boolean }[] = [
    {
      label: `${documentLabel.will} access`,
      permission: { documentType: "will", permissionRole: "steward", accessTiming: "now", hidden: false },
      disabled: !permissionAllowedByPlan(planLimits, "steward"),
    },
    {
      label: "Power of Attorney Agent",
      permission: { documentType: "power_of_attorney", permissionRole: "poa_agent", accessTiming: "incapacitated", hidden: false },
      disabled: !permissionAllowedByPlan(planLimits, "poa_agent"),
    },
    {
      label: "Health Care Proxy",
      permission: { documentType: "health_care_directive", permissionRole: "health_care_proxy", accessTiming: "incapacitated", hidden: false },
      disabled: !permissionAllowedByPlan(planLimits, "health_care_proxy"),
    },
  ];

  return (
    <div>
      <label className="field-label">Document permissions</label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {options.map(({ label, permission, disabled }) => {
          const selected = permissions.find(
            (p) =>
              p.documentType === permission.documentType &&
              (permission.documentType === "will" ||
                p.permissionRole === permission.permissionRole),
          );
          const timingOptions: AccessTiming[] =
            permission.documentType === "will"
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

function Section({
  title,
  description,
  members,
  onEdit,
  role,
  onRemove,
}: {
  title: string;
  description: string;
  members: VaultMember[];
  onEdit: (member: VaultMember) => void;
  role: VaultRole;
  onRemove: (id: string, role: VaultRole) => void;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {members.length} {members.length === 1 ? "person" : "people"}
        </p>
      </div>
      <p className="text-muted-foreground mb-4">{description}</p>
      <MemberList
        members={members}
        role={role}
        onEdit={onEdit}
        onRemove={onRemove}
      />
    </section>
  );
}

function DocumentSection({
  title,
  description,
  groups,
  onEdit,
  onRemove,
}: {
  title: string;
  description: string;
  groups: {
    title: string;
    description: string;
    members: VaultMember[];
    role: VaultRole;
  }[];
  onEdit: (member: VaultMember) => void;
  onRemove: (id: string, role: VaultRole) => void;
}) {
  const total = groups.reduce((sum, group) => sum + group.members.length, 0);
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "person" : "people"}
        </p>
      </div>
      <p className="text-muted-foreground mb-4">{description}</p>

      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.role}>
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <h3 className="text-base font-semibold">{group.title}</h3>
                <p className="text-sm text-muted-foreground">{group.description}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {group.members.length} {group.members.length === 1 ? "person" : "people"}
              </p>
            </div>
            <MemberList
              members={group.members}
              role={group.role}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function MemberList({
  members,
  role,
  onEdit,
  onRemove,
}: {
  members: VaultMember[];
  role: VaultRole;
  onEdit: (member: VaultMember) => void;
  onRemove: (id: string, role: VaultRole) => void;
}) {
  if (members.length === 0) {
    return (
      <div className="card-surface p-6 text-center">
        <p className="text-muted-foreground">None named yet.</p>
      </div>
    );
  }

  return (
    <ul className="card-surface divide-y divide-border">
      {members.map((m) => (
        <li key={m.id} className="flex items-center gap-4 px-5 py-4">
          <span className="w-10 h-10 rounded-full bg-secondary text-foreground inline-flex items-center justify-center text-base font-semibold shrink-0">
            {m.name.charAt(0).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-base font-medium text-foreground truncate">
              {m.name}
            </p>
            <p className="text-sm text-muted-foreground truncate">
              {m.email}
            </p>
            <p className="text-sm text-muted-foreground">
              {m.dateOfBirth ? `Born ${formatBirthday(m.dateOfBirth)}` : "Birthday not recorded"}
              {m.accessTiming ? ` · ${accessTimingLabel[m.accessTiming]}` : ""}
            </p>
            {m.permissions?.length ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                {m.permissions.map(permissionSummary).join(" · ")}
              </p>
            ) : null}
            {!m.userId && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Pending — will activate on signup
              </p>
            )}
          </div>
          <button
            onClick={() => onEdit(m)}
            className="btn-secondary !min-h-[36px] !text-sm shrink-0"
          >
            Edit
          </button>
          <button
            onClick={() => onRemove(m.id, role)}
            className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-md shrink-0"
            aria-label={`Remove ${roleLabel[role]} permission for ${m.name}`}
          >
            <Trash2 size={18} strokeWidth={1.5} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function formatBirthday(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

function permissionSummary(permission: MemberPermission) {
  const hidden = permission.hidden ? ", hidden" : "";
  return `${roleLabel[permission.permissionRole]} (${accessTimingLabel[permission.accessTiming]}${hidden})`;
}

function hasPermissionRole(member: VaultMember, role: VaultRole) {
  return member.role === role || Boolean(member.permissions?.some((p) => p.permissionRole === role));
}

function permissionsWithoutRole(member: VaultMember, role: VaultRole) {
  return (member.permissions ?? []).filter((p) => p.permissionRole !== role);
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
  if (permission.documentType !== "will") {
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
