import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { roleLabel } from "@/lib/permissions";
import type { VaultRole, VaultSummary } from "@/lib/types";

/**
 * VaultSwitcher — dropdown in the header showing the active vault and any
 * others the user has access to. Selecting a different vault swaps state in
 * AppContext, which re-fetches the vault per the new X-Vault-Id scope.
 */
export function VaultSwitcher() {
  const { vaults, currentVaultId, currentVaultSummary, selectVault, userOwnsVault } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (vaults.length === 0) return null;

  // With exactly one vault and no need for a "create yours" CTA in the
  // dropdown, render a flat label rather than a dropdown to keep the
  // header quiet.
  if (vaults.length === 1 && currentVaultSummary && userOwnsVault) {
    return (
      <div className="hidden md:flex items-center gap-2 px-2">
        <span className="text-sm text-foreground truncate max-w-[180px]">
          {vaultDisplayName(currentVaultSummary)}
        </span>
        <RoleBadge role={currentVaultSummary.role} label={vaultAccessLabel(currentVaultSummary)} small />
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="hidden md:flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted transition-colors rounded-md"
        aria-label="Switch vault"
      >
        <span className="text-sm text-foreground truncate max-w-[200px]">
          {currentVaultSummary ? vaultDisplayName(currentVaultSummary) : "Select a vault"}
        </span>
        {currentVaultSummary && (
          <RoleBadge role={currentVaultSummary.role} label={vaultAccessLabel(currentVaultSummary)} small />
        )}
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[320px] card-surface overflow-hidden z-50">
          <div className="px-4 py-2.5 border-b border-border">
            <p className="text-xs font-medium text-muted-foreground">
              Switch vault
            </p>
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {vaults.map((v) => {
              const active = v.id === currentVaultId;
              return (
                <li key={v.id}>
                  <button
                    onClick={() => {
                      selectVault(v.id);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted transition-colors ${
                      active ? "bg-secondary/50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {vaultDisplayName(v)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {v.role === "owner"
                            ? "Yours"
                            : `Owner · ${vaultOwnerName(v)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <RoleBadge role={v.role} label={vaultAccessLabel(v)} />
                        {active && (
                          <Check size={14} strokeWidth={1.5} className="text-primary" />
                        )}
                      </div>
                    </div>
                    {v.role === "successor" && !v.releasedAt && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Sealed — awaiting release
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {!userOwnsVault && (
            <button
              type="button"
              onClick={() => {
                navigate("/create-vault");
                setOpen(false);
              }}
              className="w-full text-left px-4 py-3 border-t border-border bg-muted/40 hover:bg-muted transition-colors flex items-center gap-2 text-sm text-foreground"
            >
              <Plus size={16} strokeWidth={1.75} />
              Create your own vault
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function RoleBadge({
  role,
  label,
  small = false,
}: {
  role: VaultRole;
  label?: string;
  small?: boolean;
}) {
  const styles: Record<VaultRole, string> = {
    owner: "bg-primary text-primary-foreground",
    steward: "bg-secondary text-foreground",
    successor: "bg-muted text-muted-foreground",
    poa_agent: "bg-accent/20 text-foreground",
    health_care_proxy: "bg-accent/20 text-foreground",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 ${
        small ? "py-0 text-[11px]" : "py-0.5 text-xs"
      } font-medium rounded-sm ${styles[role]}`}
    >
      {label ?? roleLabel[role]}
    </span>
  );
}

export function vaultAccessLabel(vault: VaultSummary) {
  return isVaultIdentityHidden(vault) ? "Hidden access" : roleLabel[vault.role];
}

export function vaultDisplayName(vault: VaultSummary) {
  return isVaultIdentityHidden(vault) ? "Sealed vault" : vault.name;
}

export function vaultOwnerName(vault: VaultSummary) {
  return isVaultIdentityHidden(vault) ? "Vault owner" : vault.ownerName;
}

export function isVaultIdentityHidden(vault: VaultSummary) {
  if (vault.role === "owner") return false;
  const permissions = permissionsForSummary(vault);
  if (!permissions.length) return false;
  return permissions.every((permission) => permission.hidden);
}

function permissionsForSummary(vault: VaultSummary) {
  return vault.permissions?.length
    ? vault.permissions
    : [
        {
          documentType:
            vault.role === "poa_agent"
              ? "power_of_attorney"
              : vault.role === "health_care_proxy"
                ? "health_care_directive"
                : "will",
          accessTiming:
            vault.accessTiming ??
            (vault.role === "successor" ? "after_death" : "incapacitated"),
          hidden: false,
        },
      ];
}
