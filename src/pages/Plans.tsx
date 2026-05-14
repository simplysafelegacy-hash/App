import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useApp } from "@/context/AppContext";
import type { SubscriptionPlan } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { Check } from "lucide-react";

const plans: {
  id: SubscriptionPlan;
  name: string;
  price: string;
  cadence: string;
  line: string;
  features: string[];
  cta: string;
  flagship: boolean;
}[] = [
  {
    id: "individual",
    name: "Individual",
    price: "15",
    cadence: "per month",
    line: "For one person putting their own affairs in order.",
    features: [
      "One vault owner",
      "Record your will and where it's kept",
      "Two authorized viewers",
    ],
    cta: "Choose Individual",
    flagship: false,
  },
  {
    id: "family",
    name: "Family",
    price: "25",
    cadence: "per month",
    line: "For families keeping several lives in careful order.",
    features: [
      "One vault owner",
      "Record your will and where it's kept",
      "Up to five authorized viewers",
      "Priority support",
    ],
    cta: "Choose Family",
    flagship: true,
  },
  // Safekeeping is intentionally hidden pre-launch — we don't yet have
  // physical vault operations stood up. The Stripe price + backend plan
  // code remain wired so re-enabling is just uncommenting this block.
  // {
  //   id: "safekeeping",
  //   name: "Safekeeping",
  //   price: "50",
  //   cadence: "per month · add-on",
  //   line: "When the original document should be in our care.",
  //   features: [
  //     "Climate-controlled physical vault",
  //     "Registered location of record",
  //     "Priority retrieval service",
  //     "Annual inventory",
  //     "Insurance coverage",
  //   ],
  //   cta: "Add Safekeeping",
  //   flagship: false,
  // },
];

export default function Plans() {
  const { startCheckout, currentUser } = useApp();
  const [searchParams] = useSearchParams();
  const [pendingPlan, setPendingPlan] = useState<SubscriptionPlan | null>(null);
  const [error, setError] = useState<string | null>(
    searchParams.get("subscription") === "canceled"
      ? "Checkout was canceled. You can try again any time."
      : null,
  );

  const onChoose = async (plan: SubscriptionPlan) => {
    setError(null);
    setPendingPlan(plan);
    try {
      await startCheckout(plan);
      // startCheckout redirects on success — control only returns here
      // in demo mode or on failure.
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not start checkout",
      );
    } finally {
      setPendingPlan(null);
    }
  };

  const isLoggedIn = currentUser !== null;

  return (
    <Layout>
      <div className="container py-10 md:py-16">
        <header className="max-w-2xl mb-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Plans</h1>
          <p className="text-lg text-muted-foreground">
            A single monthly rate. Cancel any time, no penalty.
          </p>
        </header>

        {error && (
          <div className="card-surface p-4 mb-8 border-destructive/40 bg-destructive/5">
            <p className="text-destructive text-base">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
          {plans.map((p) => {
            const isCurrent = currentUser?.subscriptionPlan === p.id;
            return (
              <article
                key={p.id}
                className={`card-surface p-6 md:p-8 flex flex-col ${
                  p.flagship ? "ring-2 ring-primary" : ""
                }`}
              >
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="text-2xl font-bold">{p.name}</h3>
                  {p.flagship && !isCurrent && (
                    <span className="text-xs font-medium bg-primary text-primary-foreground rounded px-2 py-0.5">
                      Most chosen
                    </span>
                  )}
                  {isCurrent && (
                    <span className="text-xs font-medium bg-secondary text-foreground rounded px-2 py-0.5">
                      Current
                    </span>
                  )}
                </div>
                <div className="mb-3">
                  <span className="text-base text-muted-foreground align-top mr-0.5">
                    $
                  </span>
                  <span className="text-4xl font-bold text-foreground tnum">
                    {p.price}
                  </span>
                  <span className="ml-2 text-base text-muted-foreground">
                    {p.cadence}
                  </span>
                </div>
                <p className="text-muted-foreground mb-6">{p.line}</p>
                <ul className="space-y-2.5 mb-8 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-base">
                      <Check
                        size={18}
                        strokeWidth={2}
                        className="text-primary shrink-0 mt-0.5"
                      />
                      <span className="text-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => onChoose(p.id)}
                  disabled={!isLoggedIn || pendingPlan !== null || isCurrent}
                  className={p.flagship ? "btn-primary" : "btn-secondary"}
                  title={
                    !isLoggedIn ? "Sign in or create an account first" : undefined
                  }
                >
                  {pendingPlan === p.id
                    ? "Redirecting…"
                    : isCurrent
                      ? "Current plan"
                      : p.cta}
                </button>
                {!isLoggedIn && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Sign in to subscribe.
                  </p>
                )}
              </article>
            );
          })}
        </div>

        <div className="mt-16 pt-10 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              q: "What if I stop paying?",
              a: "Your vault is preserved, read-only, for 90 days. You can resume at any point. After 90 days, your entries are permanently removed.",
            },
            {
              q: "Can I change my plan?",
              a: "Yes. You can switch at any time from the customer portal; the price is prorated and cancellation takes effect at the end of the period.",
            },
            {
              q: "Is there a free trial?",
              a: "A 14-day trial on every plan. You won't be charged until day 15.",
            },
          ].map((faq) => (
            <div key={faq.q}>
              <h4 className="text-lg font-semibold mb-2">{faq.q}</h4>
              <p className="text-muted-foreground leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
