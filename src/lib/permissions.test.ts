import { describe, expect, it } from "vitest";
import { permissionsForVault } from "./permissions";
import type { VaultSummary } from "./types";

describe("vault permissions fail closed", () => {
  it.each(["steward", "successor", "poa_agent", "health_care_proxy"] as const)(
    "%s cannot read without explicit permissions, even after release", (role) => {
      const summary = { role, permissions: [], releasedAt: "2026-01-01", accessTiming: "now" } as VaultSummary;
      expect(permissionsForVault(null, summary).canRead).toBe(false);
    },
  );
  it("preserves owner access", () => {
    expect(permissionsForVault(null, { role: "owner" } as VaultSummary).canRead).toBe(true);
  });
  it("keeps hidden grants unreadable after release", () => {
    const summary = { role: "successor", releasedAt: "2026-01-01", permissions: [
      { documentType: "will", permissionRole: "successor", accessTiming: "after_death", hidden: true },
    ] } as VaultSummary;
    expect(permissionsForVault(null, summary).canRead).toBe(false);
  });
});
