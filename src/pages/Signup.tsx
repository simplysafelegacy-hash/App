import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SealMark } from "@/components/SealMark";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { useApp } from "@/context/AppContext";
import { ApiError } from "@/lib/api";

const MIN_PASSWORD_LEN = 12;

export default function Signup() {
  const navigate = useNavigate();
  const { signUpWithPassword } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goNext = ({ newUser }: { newUser: boolean }) =>
    navigate(newUser ? "/create-vault" : "/dashboard");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LEN) {
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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-10">
          <Link to="/">
            <SealMark size={40} />
          </Link>
        </div>

        <div className="card-surface p-8 md:p-10">
          <h1 className="text-3xl font-bold text-center text-foreground mb-2">
            Create your account
          </h1>
          <p className="text-center text-muted-foreground mb-8">
            One vault, kept in your name.
          </p>

          <GoogleSignInButton
            label="Continue with Google"
            onSuccess={goNext}
            onError={(msg) => setError(msg)}
          />

          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 border-t border-border" />
            <span className="text-sm text-muted-foreground">or</span>
            <div className="flex-1 border-t border-border" />
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
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
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LEN}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 12 characters"
                className="field"
              />
              <p className="field-hint">
                A long passphrase is easier to remember and harder to guess.
              </p>
            </div>

            <button
              type="submit"
              disabled={pending}
              className="btn-primary w-full"
            >
              {pending ? "Creating account…" : "Create account"}
            </button>
          </form>

          {error && (
            <p className="text-destructive text-center text-sm mt-5">
              {error}
            </p>
          )}

          <p className="text-sm text-muted-foreground text-center mt-8">
            By continuing you agree to our{" "}
            <a href="#" className="link">Terms</a> and{" "}
            <a href="#" className="link">Privacy Policy</a>.
          </p>
        </div>

        <p className="text-center text-muted-foreground mt-8">
          Already have an account?{" "}
          <Link to="/login" className="link">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
