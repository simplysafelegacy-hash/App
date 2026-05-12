import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { roleLabel } from "@/lib/permissions";
import type { VaultRole } from "@/lib/types";

/**
 * VaultSwitcher — dropdown in the header showing the active vault and any
 * others the user has access to (owned + member). Selecting a different
 * vault swaps state in AppContext, which re-fetches the vault per the new
 * X-Vault-Id scope.
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

  // If only one vault, show it as a non-interactive label.
  if (vaults.length === 1 && currentVaultSummary) {
    return (
      <div className="hidden md:flex items-center gap-3 px-3 py-1.5">
        <div className="text-right">
          <p className="text-[15px] text-ink leading-tight truncate max-w-[180px]">
            {currentVaultSummary.name}
          </p>
          <RoleBadge role={currentVaultSummary.role} small />
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="hidden md:flex items-center gap-3 pl-3 pr-2 py-1.5 hover:bg-paper-sunk/40 transition-colors rounded-sm group"
        aria-label="Switch vault"
      >
        <div className="text-right max-w-[200px]">
          <p className="text-[15px] text-ink leading-tight truncate">
            {currentVaultSummary?.name ?? "Select a vault"}
          </p>
          {currentVaultSummary && (
            <RoleBadge role={currentVaultSummary.role} small />
          )}
        </div>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={`text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] paper-card rounded-sm overflow-hidden z-50">
          <div className="px-5 py-3 border-b border-hairline-soft">
            <p className="eyebrow">Switch vault</p>
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
                    className={`w-full text-left px-5 py-4 border-b border-hairline-soft last:border-b-0 hover:bg-paper-sunk/40 transition-colors ${
                      active ? "bg-paper-sunk/30" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-serif text-lg tracking-tight text-ink truncate"
                          style={{ fontVariationSettings: "'opsz' 36" }}
                        >
                          {v.name}
                        </p>
                        <p className="italic-serif text-sm text-ink-subtle truncate mt-0.5">
                          {v.role === "owner"
                            ? "Yours"
                            : `Owner · ${v.ownerName}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <RoleBadge role={v.role} />
                        {active && (
                          <Check size={14} strokeWidth={1.5} className="text-seal" />
                        )}
                      </div>
                    </div>
                    {v.role === "successor" && !v.releasedAt && (
                      <p className="italic-serif text-xs text-ink-subtle mt-2">
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
    owner: "bg-ink text-paper",
    steward: "bg-seal-soft text-seal border border-seal/20",
    successor: "bg-paper-sunk text-ink-muted border border-hairline",
  };
  return (
    <span
      className={`inline-flex items-center px-2 ${
        small ? "text-[10px] py-0" : "text-[10px] py-0.5"
      } font-medium tracking-[0.15em] uppercase rounded-sm ${styles[role]}`}
    >
      {roleLabel[role]}
    </span>
  );
}
