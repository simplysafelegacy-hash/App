import { Link } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useApp } from "@/context/AppContext";

/**
 * Password reset is handled by Auth0.
 *
 * This app has no password store and no reset endpoint, so the flow lives
 * behind the "Forgot password?" link on Auth0's hosted login page. The route
 * is kept so existing links and bookmarks don't 404.
 */
export default function ForgotPassword() {
  const { signIn } = useApp();

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll take you to the secure sign-in page."
    >
      <div className="space-y-5">
        <p className="text-base text-muted-foreground">
          Password resets happen on our secure sign-in page. Choose{" "}
          <span className="font-medium text-foreground">Forgot password?</span>{" "}
          there and we'll email you a reset link.
        </p>
        <button
          type="button"
          onClick={() => void signIn()}
          className="btn-primary w-full"
        >
          Continue to sign in
        </button>
        <p className="text-base text-muted-foreground">
          Remembered it?{" "}
          <Link to="/login" className="underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
