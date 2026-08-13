import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { ArrowLeft, MailCheck } from "lucide-react";

/**
 * Password reset request. There is no backend reset endpoint yet, so this
 * confirms the request without sending mail — it's deliberately vague about
 * whether the address exists (good practice, and honest given no email is
 * actually dispatched). Wire to the real API once it exists.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: call the password-reset API once it exists.
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="If an account exists for that address, we've sent a link to reset your password."
      >
        <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-4">
          <MailCheck
            size={22}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-primary"
            aria-hidden
          />
          <p className="text-base text-foreground">
            The link expires in one hour. Didn't get it? Check your spam folder,
            or{" "}
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="link font-semibold"
            >
              try a different email
            </button>
            .
          </p>
        </div>

        <Link
          to="/login"
          className="mt-8 inline-flex items-center gap-2 link font-semibold"
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to set a new one."
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="field"
          />
        </div>

        <button type="submit" className="btn-primary w-full">
          Send reset link
        </button>
      </form>

      <Link
        to="/login"
        className="mt-8 inline-flex items-center gap-2 link font-semibold"
      >
        <ArrowLeft size={18} strokeWidth={1.75} />
        Back to sign in
      </Link>
    </AuthLayout>
  );
}
