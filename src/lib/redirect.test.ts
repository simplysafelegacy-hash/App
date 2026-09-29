import { expect, it } from "vitest";
import { setPostLoginTarget, takePostLoginTarget } from "./redirect";
it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/\nevil.example"])(
  "rejects external or ambiguous redirect %s", (target) => {
    setPostLoginTarget(target);
    expect(takePostLoginTarget()).toBe("/dashboard");
  },
);
it("preserves an internal target exactly once", () => {
  setPostLoginTarget("/dashboard?tab=will");
  expect(takePostLoginTarget()).toBe("/dashboard?tab=will");
  expect(takePostLoginTarget()).toBe(null);
});
