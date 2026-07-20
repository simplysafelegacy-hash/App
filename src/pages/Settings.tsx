import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { PageHeader } from "@/components/layout/PageHeader";
import { useApp } from "@/context/AppContext";
import { ApiError, api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, LifeBuoy, Mail, ShieldCheck, User } from "lucide-react";

const DEMO_MODE = (import.meta.env.VITE_DEMO_MODE ?? "true") === "true";

export default function Settings() {
  const {
    currentUser,
    isAuthenticated,
    loading,
    openCustomerPortal,
    userOwnsVault,
  } = useApp();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAuthenticated) navigate("/login");
  }, [isAuthenticated, loading, navigate]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      if (!DEMO_MODE) {
        await api.support.createTicket({ subject, message });
      }
      setSubject("");
      setMessage("");
      toast({
        title: "Support ticket opened",
        description: "Your message was sent to the Simply Safe Legacy team.",
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not open support ticket",
      );
    } finally {
      setSending(false);
    }
  };

  if (loading || !currentUser) return null;

  const planName =
    currentUser.planLimits?.name ??
    (currentUser.subscriptionPlan
      ? currentUser.subscriptionPlan.charAt(0).toUpperCase() +
        currentUser.subscriptionPlan.slice(1)
      : "Free");

  return (
    <Layout>
      <div className="container py-7 md:py-10 max-w-5xl">
        <PageHeader
          title="Settings"
          lede="Manage your account, billing, and support requests."
        />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5">
          <section className="card-surface p-5 md:p-6">
            <div className="flex items-start gap-3 mb-6">
              <span className="w-9 h-9 rounded bg-secondary inline-flex items-center justify-center shrink-0">
                <LifeBuoy size={18} strokeWidth={1.75} />
              </span>
              <div>
                <h2 className="text-xl font-semibold">Open a support ticket</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Send a note directly to the Simply Safe Legacy team.
                </p>
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label htmlFor="support-subject" className="field-label">
                  Subject
                </label>
                <input
                  id="support-subject"
                  className="field"
                  value={subject}
                  maxLength={180}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="What can we help with?"
                  required
                />
              </div>

              <div>
                <label htmlFor="support-message" className="field-label">
                  Message
                </label>
                <textarea
                  id="support-message"
                  className="field min-h-[190px] resize-y leading-relaxed"
                  value={message}
                  maxLength={5000}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Share the details, including anything you were trying to do when the issue came up."
                  required
                />
                <p className="field-hint">
                  Replies will go to {currentUser.email}.
                </p>
              </div>

              {error && (
                <div className="border border-destructive/40 bg-destructive/5 rounded p-3">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={sending || subject.trim() === "" || message.trim() === ""}
                >
                  <Mail size={16} strokeWidth={1.75} />
                  {sending ? "Sending..." : "Send ticket"}
                </button>
              </div>
            </form>
          </section>

          <aside className="space-y-5">
            <section className="card-surface p-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-8 h-8 rounded bg-secondary inline-flex items-center justify-center">
                  <User size={17} strokeWidth={1.75} />
                </span>
                <h2 className="text-base font-semibold">Account</h2>
              </div>
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Name</dt>
                  <dd className="text-sm text-foreground mt-0.5">{currentUser.name}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Email</dt>
                  <dd className="text-sm text-foreground mt-0.5 break-all">
                    {currentUser.email}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="card-surface p-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-8 h-8 rounded bg-secondary inline-flex items-center justify-center">
                  <CreditCard size={17} strokeWidth={1.75} />
                </span>
                <h2 className="text-base font-semibold">Plan</h2>
              </div>
              <p className="text-sm text-foreground">{planName}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {currentUser.planLimits
                  ? `Up to ${currentUser.planLimits.maxAuthorizedPeople} authorized people.`
                  : "Plan details load after billing is connected."}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={openCustomerPortal}
                  className="btn-secondary !w-full"
                >
                  Manage billing
                </button>
                <Link to="/plans" className="btn-secondary !w-full">
                  View plans
                </Link>
              </div>
            </section>

            <section className="card-surface p-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-8 h-8 rounded bg-secondary inline-flex items-center justify-center">
                  <ShieldCheck size={17} strokeWidth={1.75} />
                </span>
                <h2 className="text-base font-semibold">Vault</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {userOwnsVault
                  ? "Your vault settings live on the Vault and People pages."
                  : "You do not own a vault yet."}
              </p>
              <Link
                to={userOwnsVault ? "/dashboard" : "/create-vault"}
                className="btn-secondary !w-full mt-4"
              >
                {userOwnsVault ? "Open vault" : "Create vault"}
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </Layout>
  );
}
