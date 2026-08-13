import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useApp } from "@/context/AppContext";
import { ApiError } from "@/lib/api";
import { Check, Eye, EyeOff } from "lucide-react";

const MIN_PASSWORD_LEN = 12;

export default function Signup() {
  const navigate = useNavigate();
  const { signUpWithPassword } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const longEnough = password.length >= MIN_PASSWORD_LEN;

  const goNext = ({ newUser }: { newUser: boolean }) =>
    navigate(newUser ? "/create-vault" : "/dashboard");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!longEnough) {
      setError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
      return;
    }
    setPending(true);
    try {
      const res = await signUpWithPassword({ name, email, password });
      goNext(res);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not create account";
      setError(msg);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="One vault, kept in your name."
    >
      <GoogleSignInButton
        label="Continue with Google"
        onSuccess={goNext}
        onError={(msg) => setError(msg)}
      />

      <div className="my-6 flex items-center gap-4">
        <div className="flex-1 border-t border-border" />
        <span className="text-base text-muted-foreground">or</span>
        <div className="flex-1 border-t border-border" />
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label htmlFor="name" className="field-label">
            Full name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Mitchell"
            className="field"
          />
        </div>
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
            placeholder="jane@example.com"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LEN}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 12 characters"
              className="field pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff size={20} strokeWidth={1.75} />
              ) : (
                <Eye size={20} strokeWidth={1.75} />
              )}
            </button>
          </div>
          <p
            className={`field-hint flex items-center gap-1.5 ${
              longEnough ? "text-status-done" : ""
            }`}
          >
            {longEnough && <Check size={16} strokeWidth={2.25} />}
            {longEnough
              ? "Looks good — a long passphrase is easy to remember and hard to guess."
              : "A long passphrase is easier to remember and harder to guess."}
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-base text-destructive"
          >
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="text-base text-muted-foreground text-center mt-6">
        By continuing you agree to our{" "}
        <a href="#" className="link">Terms</a> and{" "}
        <a href="#" className="link">Privacy Policy</a>.
      </p>

      <p className="text-center text-muted-foreground mt-6 text-base">
        Already have an account?{" "}
        <Link to="/login" className="link font-semibold">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
