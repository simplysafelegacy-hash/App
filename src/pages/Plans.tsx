import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useApp } from "@/context/AppContext";
import type { PlanLimits, SubscriptionPlan } from "@/lib/types";
import { api, ApiError } from "@/lib/api";
import { Check } from "lucide-react";

const DEMO_MODE = (import.meta.env.VITE_DEMO_MODE ?? "true") === "true";

const fallbackPlans: PlanLimits[] = [
  {
    planCode: "free",
    name: "Free",
    priceCents: 0,
    cadence: "per month",
    displayOrder: 10,
    maxAuthorizedPeople: 0,
    allowWill: true,
    allowPowerOfAttorney: false,
    allowHealthCareDirective: false,
    active: true,
  },
  {
    planCode: "individual",
    name: "Individual",
    priceCents: 800,
    cadence: "per month",
    displayOrder: 20,
    maxAuthorizedPeople: 4,
    allowWill: true,
    allowPowerOfAttorney: true,
    allowHealthCareDirective: true,
    active: true,
  },
  {
    planCode: "family",
    name: "Family",
    priceCents: 2000,
    cadence: "per month",
    displayOrder: 30,
    maxAuthorizedPeople: 15,
    allowWill: true,
    allowPowerOfAttorney: true,
    allowHealthCareDirective: true,
    active: true,
  },
];

export default function Plans() {
  const { startCheckout, currentUser } = useApp();
  const [searchParams] = useSearchParams();
  const [pendingPlan, setPendingPlan] = useState<SubscriptionPlan | null>(null);
  const [plans, setPlans] = useState<PlanLimits[]>(fallbackPlans);
  const [error, setError] = useState<string | null>(
    searchParams.get("subscription") === "canceled"
      ? "Checkout was canceled. You can try again any time."
      : null,
  );

  useEffect(() => {
    if (DEMO_MODE) return;
    api.billing
      .plans()
      .then((loaded) => {
        if (loaded.length) setPlans(loaded);
      })
      .catch(() => {});
  }, []);

  const onChoose = async (plan: SubscriptionPlan) => {
    if (plan === "free") return;
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
      <div className="container py-8 md:py-12">
        <header className="max-w-2xl mb-10">
          <h1 className="text-2xl md:text-3xl font-semibold mb-3">Plans</h1>
          <p className="text-base text-muted-foreground">
            A single monthly rate. Cancel any time, no penalty.
          </p>
        </header>

        {error && (
          <div className="card-surface p-4 mb-8 border-destructive/40 bg-destructive/5">
            <p className="text-destructive text-base">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl">
          {plans.map((p) => {
            const isCurrent =
              (currentUser?.planLimits?.planCode ?? currentUser?.subscriptionPlan ?? "free") ===
              p.planCode;
            const flagship = p.planCode === "family";
            return (
              <article
                key={p.planCode}
                className={`card-surface p-5 md:p-6 flex flex-col ${
                  flagship ? "ring-2 ring-primary" : ""
                }`}
              >
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="text-xl font-semibold">{p.name}</h3>
                  {flagship && !isCurrent && (
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
                  <span className="text-3xl font-semibold text-foreground tnum">
                    {(p.priceCents / 100).toLocaleString("en-US", {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                  <span className="ml-2 text-base text-muted-foreground">
                    {p.cadence}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-6">{planLine(p)}</p>
                <ul className="space-y-2.5 mb-8 flex-1">
                  {planFeatures(p).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
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
                  onClick={() => onChoose(p.planCode)}
                  disabled={
                    p.planCode === "free" ||
                    !isLoggedIn ||
                    pendingPlan !== null ||
                    isCurrent
                  }
                  className={flagship ? "btn-primary" : "btn-secondary"}
                  title={
                    !isLoggedIn ? "Sign in or create an account first" : undefined
                  }
                >
                  {pendingPlan === p.planCode
                    ? "Redirecting…"
                    : isCurrent
                      ? "Current plan"
                      : p.planCode === "free"
                        ? "Included"
                        : `Choose ${p.name}`}
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

        <div className="mt-14 pt-8 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-7">
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
              <h4 className="text-base font-semibold mb-2">{faq.q}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}

function planLine(plan: PlanLimits) {
  if (plan.planCode === "free") {
    return "For recording your own will before inviting anyone else.";
  }
  if (plan.planCode === "family") {
    return "For families keeping several lives in careful order.";
  }
  return "For one person who needs all core documents and a small circle of access.";
}

function planFeatures(plan: PlanLimits) {
  const features = ["One vault owner"];
  if (plan.allowWill) features.push("Record your will and where it's kept");
  if (plan.allowPowerOfAttorney) features.push("Record power of attorney");
  if (plan.allowHealthCareDirective) features.push("Record health care directive");
  if (plan.maxAuthorizedPeople > 0) {
    features.push(`Up to ${plan.maxAuthorizedPeople} authorized people`);
  } else {
    features.push("No authorized people");
  }
  return features;
}
