import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
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
    <Layout showFooter={false}>
      <div className="container py-16 md:py-24">
        <div className="max-w-[480px] mx-auto">
          <div className="text-center mb-12 fade-in-up">
            <p className="eyebrow mb-5">Return to your vault</p>
            <h1 className="display-serif text-5xl md:text-6xl text-balance">
              Welcome <span className="italic-serif text-seal">back.</span>
            </h1>
          </div>

          <div className="fade-in-up delay-200">
            <GoogleSignInButton
              label="Continue with Google"
              onSuccess={goNext}
              onError={(msg) => setError(msg)}
            />

            <div className="my-8 flex items-center gap-4">
              <div className="flex-1 border-t border-hairline-soft" />
              <span className="italic-serif text-ink-subtle text-sm">or</span>
              <div className="flex-1 border-t border-hairline-soft" />
            </div>

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
                className="btn-ink w-full"
              >
                {pending ? "Just a moment…" : "Sign in"}
              </button>
            </form>

            {error && (
              <p className="italic-serif text-seal text-center text-[15px] mt-5">
                {error}
              </p>
            )}

            <p className="mt-8 italic-serif text-sm text-ink-subtle text-center leading-relaxed">
              Sign in with whichever method you used when you opened your
              vault. We never see your Google password, and your Sealed
              password is stored only as a one-way hash.
            </p>
          </div>

          <div className="mt-12 pt-8 border-t border-hairline-soft text-center fade-in-up delay-300">
            <p className="text-ink-muted">
              New here?{" "}
              <Link to="/signup" className="link-ink">
                Open a vault
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
