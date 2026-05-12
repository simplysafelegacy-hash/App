import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Individual",
    price: "15",
    cadence: "per month",
    line: "For one person putting their own affairs in order.",
    features: [
      "One vault owner",
      "Unlimited documents",
      "Two authorized viewers",
      "Encrypted cloud storage",
    ],
    cta: "Choose Individual",
    flagship: false,
  },
  {
    name: "Family",
    price: "25",
    cadence: "per month",
    line: "For families keeping several lives in careful order.",
    features: [
      "One vault owner",
      "Unlimited documents",
      "Up to five authorized viewers",
      "Encrypted cloud storage",
      "Priority support",
      "Document amendment history",
    ],
    cta: "Choose Family",
    flagship: true,
  },
  {
    name: "Safekeeping",
    price: "50",
    cadence: "per month · add-on",
    line: "When the original documents should be in our care.",
    features: [
      "Climate-controlled physical vault",
      "Registered location of record",
      "Priority retrieval service",
      "Annual inventory",
      "Insurance coverage",
    ],
    cta: "Add Safekeeping",
    flagship: false,
  },
];

export default function Plans() {
  return (
    <Layout>
      <div className="container py-10 md:py-16">
        <header className="max-w-2xl mb-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Plans</h1>
          <p className="text-lg text-muted-foreground">
            A single monthly rate. Cancel any time, no penalty.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((p) => (
            <article
              key={p.name}
              className={`card-surface p-6 md:p-8 flex flex-col ${
                p.flagship ? "ring-2 ring-primary" : ""
              }`}
            >
              <div className="flex items-baseline justify-between mb-4">
                <h3 className="text-2xl font-bold">{p.name}</h3>
                {p.flagship && (
                  <span className="text-xs font-medium bg-primary text-primary-foreground rounded px-2 py-0.5">
                    Most chosen
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
              <Link
                to="/signup"
                className={p.flagship ? "btn-primary" : "btn-secondary"}
              >
                {p.cta}
              </Link>
            </article>
          ))}
        </div>

        <div className="mt-16 pt-10 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              q: "What if I stop paying?",
              a: "Your vault is preserved, read-only, for 90 days. You can resume at any point. After 90 days, your entries are permanently removed.",
            },
            {
              q: "Can I change my plan?",
              a: "Yes. You can switch at any time; the price is prorated and cancellation takes effect at the end of the period.",
            },
            {
              q: "Is there a free trial?",
              a: "A 14-day trial on every plan. You won't be charged until the 15th day.",
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
