/**
 * Terms of Service / Privacy Policy consent.
 *
 * Both documents are served by this app (see src/pages/PrivacyPolicy.tsx and
 * src/pages/TermsOfService.tsx), so these are relative paths: they resolve on
 * whatever host the app is running on, which keeps dev pointing at dev
 * rather than at production's copy of the text. Still opened in a new tab —
 * a user reading the terms must not lose the signup they are part-way
 * through.
 */

export const PRIVACY_POLICY_URL = "/legal/privacy";
export const TERMS_URL = "/legal/terms";

/**
 * Marker that survives the round trip to Auth0.
 *
 * The user ticks the box on /signup, then leaves the app entirely for
 * Auth0's hosted page. React state does not survive that, so the intent is
 * parked in sessionStorage and read when they land back — at which point
 * the app has a token and can record the acceptance server-side.
 *
 * sessionStorage rather than localStorage: the flag is scoped to this tab
 * and this signup attempt, and should not linger afterwards. It is only an
 * intent marker — the authoritative record is the row the backend writes,
 * stamped with the server's own time.
 */
const PENDING_CONSENT_KEY = "ssl.pendingLegalConsent";

export function markConsentPending(): void {
  try {
    sessionStorage.setItem(PENDING_CONSENT_KEY, "1");
  } catch {
    // Private mode or blocked storage. The consent gate on return still
    // catches the user, so this is a degraded path, not a broken one.
  }
}

export function consentIsPending(): boolean {
  try {
    return sessionStorage.getItem(PENDING_CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPendingConsent(): void {
  try {
    sessionStorage.removeItem(PENDING_CONSENT_KEY);
  } catch {
    // Nothing to do — a stale marker only causes one redundant POST.
  }
}
