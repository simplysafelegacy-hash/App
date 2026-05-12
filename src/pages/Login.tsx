import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SealMark } from "@/components/SealMark";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { useApp } from "@/context/AppContext";
import { ApiError } from "@/lib/api";

export default function Login() {
  const navigate = useNavigate();
  const { signInWithPassword } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goNext = ({ newUser }: { newUser: boolean }) =>
    navigate(newUser ? "/create-vault" : "/dashboard");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await signInWithPassword({ email, password });
      goNext(res);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Sign-in failed";
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
            Sign in
          </h1>
          <p className="text-center text-muted-foreground mb-8">
            Welcome back.
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
            <div>
              <label htmlFor="password" className="field-label">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className="field"
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="btn-primary w-full"
            >
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {error && (
            <p className="text-destructive text-center text-sm mt-5">
              {error}
            </p>
          )}
        </div>

        <p className="text-center text-muted-foreground mt-8">
          New here?{" "}
          <Link to="/signup" className="link">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
