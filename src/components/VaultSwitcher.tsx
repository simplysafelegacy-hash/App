import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { roleLabel } from "@/lib/permissions";
import type { VaultRole } from "@/lib/types";

/**
 * VaultSwitcher — dropdown in the header showing the active vault and any
 * others the user has access to. Selecting a different vault swaps state in
 * AppContext, which re-fetches the vault per the new X-Vault-Id scope.
 */
export function VaultSwitcher() {
  const { vaults, currentVaultId, currentVaultSummary, selectVault } = useApp();
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

  if (vaults.length === 1 && currentVaultSummary) {
    return (
      <div className="hidden md:flex items-center gap-2 px-3">
        <span className="text-base text-foreground truncate max-w-[180px]">
          {currentVaultSummary.name}
        </span>
        <RoleBadge role={currentVaultSummary.role} small />
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors rounded-md"
        aria-label="Switch vault"
      >
        <span className="text-base text-foreground truncate max-w-[200px]">
          {currentVaultSummary?.name ?? "Select a vault"}
        </span>
        {currentVaultSummary && (
          <RoleBadge role={currentVaultSummary.role} small />
        )}
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] card-surface shadow-lg overflow-hidden z-50">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-sm font-medium text-muted-foreground">
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
                    className={`w-full text-left px-5 py-4 border-b border-border last:border-b-0 hover:bg-muted transition-colors ${
                      active ? "bg-secondary/50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-medium text-foreground truncate">
                          {v.name}
                        </p>
                        <p className="text-sm text-muted-foreground truncate mt-0.5">
                          {v.role === "owner"
                            ? "Yours"
                            : `Owner · ${v.ownerName}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <RoleBadge role={v.role} />
                        {active && (
                          <Check size={14} strokeWidth={1.5} className="text-primary" />
                        )}
                      </div>
                    </div>
                    {v.role === "successor" && !v.releasedAt && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Sealed — awaiting release
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RoleBadge({
  role,
  small = false,
}: {
  role: VaultRole;
  small?: boolean;
}) {
  const styles: Record<VaultRole, string> = {
    owner: "bg-primary text-primary-foreground",
    steward: "bg-secondary text-foreground",
    successor: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center px-2 ${
        small ? "py-0 text-[11px]" : "py-0.5 text-xs"
      } font-medium rounded ${styles[role]}`}
    >
      {roleLabel[role]}
    </span>
  );
}
