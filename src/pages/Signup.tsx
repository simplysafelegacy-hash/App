import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
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
    <Layout showFooter={false}>
      <div className="container py-16 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 max-w-6xl mx-auto">
          <div className="lg:col-span-5 fade-in-up">
            <p className="eyebrow mb-5">A new account</p>
            <h1 className="display-serif text-5xl md:text-6xl leading-[0.98] text-balance">
              Begin a <br />
              <span className="italic-serif text-seal">quiet ledger.</span>
            </h1>
            <p className="mt-6 text-lg text-ink-muted max-w-sm leading-relaxed">
              You may continue with your Google account, or set a password
              of your own. Either way, only you hold the key.
            </p>
            <div className="rule my-10" />
            <dl className="space-y-6">
              {[
                ["I.", "Open your account in whichever way you prefer."],
                ["II.", "Tell us who to notify if you're unwell."],
                ["III.", "Begin adding the papers that matter."],
              ].map(([n, t]) => (
                <div key={n} className="flex items-baseline gap-5">
                  <dt
                    className="font-serif text-2xl text-seal tnum shrink-0"
                    style={{ fontVariationSettings: "'opsz' 96" }}
                  >
                    {n}
                  </dt>
                  <dd className="text-ink text-lg">{t}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="lg:col-span-7 fade-in-up delay-200">
            <div
              className="paper-card p-10 md:p-14"
              style={{ borderRadius: "2px" }}
            >
              <h2 className="font-serif text-3xl tracking-tight mb-3">
                Open your vault
              </h2>
              <p className="italic-serif text-ink-muted mb-10">
                One click with Google, or a password of your choosing.
              </p>

              <GoogleSignInButton
                label="Continue with Google"
                onSuccess={goNext}
                onError={(msg) => setError(msg)}
              />

              <div className="my-8 flex items-center gap-4">
                <div className="flex-1 border-t border-hairline-soft" />
                <span className="italic-serif text-ink-subtle text-sm">
                  or set a password
                </span>
                <div className="flex-1 border-t border-hairline-soft" />
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
                    placeholder="Jane Eliza Mitchell"
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
                  <p className="italic-serif text-ink-subtle text-sm mt-2">
                    A long passphrase is easier to remember and harder to
                    guess. We will help you add a second factor later.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={pending}
                  className="btn-ink w-full"
                >
                  {pending ? "Just a moment…" : "Open the vault"}
                </button>
              </form>

              {error && (
                <p className="italic-serif text-seal text-[15px] mt-5">
                  {error}
                </p>
              )}

              <p className="mt-10 text-sm text-ink-subtle leading-relaxed">
                By continuing you agree to our{" "}
                <a href="#" className="link-ink">
                  Terms
                </a>{" "}
                and{" "}
                <a href="#" className="link-ink">
                  Privacy Policy
                </a>
                . We store passwords only as a one-way hash and never sell
                or share your information.
              </p>
            </div>

            <p className="mt-6 text-center text-ink-muted">
              Already have a vault?{" "}
              <Link to="/login" className="link-ink">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
