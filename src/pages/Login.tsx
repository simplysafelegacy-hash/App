import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useApp } from "@/context/AppContext";

/**
 * Sign-in hand-off.
 *
 * Credentials are collected by Auth0's Universal Login, not by this app —
 * no password ever reaches our origin, so there is no form here. This page
 * exists to keep /login a working URL (bookmarks, redirects, the marketing
 * site) and to bounce the visitor to Auth0.
 */
export default function Login() {
  const navigate = useNavigate();
  const { signIn, isAuthenticated, loading } = useApp();
  const { isAuthenticated: hasAuth0Session } = useAuth0();
  const [error, setError] = useState<string | null>(null);
  // One hand-off per visit. Without this the effect can re-fire and bounce
  // the user to Auth0 again while the first redirect is still in flight.
  const redirected = useRef(false);

  useEffect(() => {
    if (loading) return;

    // Already signed in — nothing to do here.
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
      return;
    }

    // Auth0 says there is a session but the app has no user: the bootstrap
    // call failed (backend down, or the token was rejected). Sending the
    // user back to Auth0 would just loop — they would sign in successfully,
    // land here, and fail the same way. Show the error instead.
    if (hasAuth0Session) {
      setError("Signed in, but we could not load your account. Please try again.");
      return;
    }

    if (redirected.current) return;
    redirected.current = true;
    signIn().catch(() => {
      redirected.current = false;
      setError("Could not reach the sign-in service. Please try again.");
    });
  }, [loading, isAuthenticated, hasAuth0Session, signIn, navigate]);

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Access your Simply Safe Legacy vault."
    >
      {error ? (
        <div className="space-y-5">
          <p role="alert" className="text-base text-destructive">
            {error}
          </p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              void signIn();
            }}
            className="btn-primary w-full"
          >
            Try again
          </button>
          <p className="text-base text-muted-foreground">
            Need an account?{" "}
            <Link to="/signup" className="underline">
              Create one
            </Link>
          </p>
        </div>
      ) : (
        <p className="text-base text-muted-foreground">
          Redirecting you to sign in…
        </p>
      )}
    </AuthLayout>
  );
}
