import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useApp } from "@/context/AppContext";
import { markConsentPending, PRIVACY_POLICY_URL, TERMS_URL } from "@/lib/legal";

/**
 * Sign-up hand-off, gated on accepting the Terms and Privacy Policy.
 *
 * Account creation itself happens on Auth0's hosted page — password rules,
 * breach detection and email verification are Auth0's to enforce. But the
 * hosted page is not ours to add a checkbox to, so consent is collected
 * here, *before* the hand-off: the user cannot reach Auth0's sign-up form
 * without having ticked the box.
 *
 * The single checkbox covers four claims — 18 or over, New Jersey resident,
 * agreement to the Terms, and acknowledgement of the Privacy Policy. All
 * four are recorded as separate columns server-side (see handlers/legal.go),
 * so the record stays meaningful if this copy later changes.
 *
 * The acceptance is recorded server-side on return, once the account exists
 * and the SPA holds an access token (see AppContext's bootstrap).
 */
export default function Signup() {
  const navigate = useNavigate();
  const { signIn, isAuthenticated, loading } = useApp();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  // Someone already signed in has no business on the sign-up page.
  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/create-vault", { replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  const onContinue = async () => {
    if (!accepted) {
      setError("Please accept the Terms of Service and Privacy Policy to continue.");
      return;
    }
    setError(null);
    setRedirecting(true);
    // Parked before the redirect: the app is about to be unloaded, and the
    // acceptance has to survive the trip to Auth0 and back.
    markConsentPending();
    try {
      await signIn({ signUp: true });
    } catch {
      setRedirecting(false);
      setError("Could not reach the sign-up service. Please try again.");
    }
  };

  return (
    <AuthLayout
      title="Create your vault"
      subtitle="Start organizing what matters most."
    >
      <div className="space-y-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => {
              setAccepted(e.target.checked);
              if (e.target.checked) setError(null);
            }}
            aria-describedby={error ? "legal-consent-error" : undefined}
            className="mt-1 h-4 w-4 shrink-0 rounded border-input accent-primary"
          />
          <span className="text-base leading-relaxed text-muted-foreground">
             I confirm that I am at least 18 years old and a New Jersey resident, agree to the{" "}
            <a
              href={TERMS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-foreground"
            >
              Terms of Service
            </a>{" "}
            and acknowledge the{" "}
            <a
              href={PRIVACY_POLICY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-foreground"
            >
              Privacy Policy
            </a>
            .
          </span>
        </label>

        {error && (
          <p
            id="legal-consent-error"
            role="alert"
            className="text-base text-destructive"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onContinue}
          disabled={!accepted || redirecting}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {redirecting ? "Redirecting…" : "Continue to sign up"}
        </button>

        <p className="text-base text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
