import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";

const plans = [
  {
    name: "Individual",
    price: "15",
    cadence: "per month",
    line: "For a single person putting their own affairs in order.",
    features: [
      "One vault owner",
      "Unlimited documents",
      "Two authorized viewers",
      "Encrypted cloud storage",
      "Private correspondence support",
    ],
    cta: "Begin with Individual",
    flagship: false,
  },
  {
    name: "Family",
    price: "25",
    cadence: "per month",
    line: "For families who wish to keep several lives in careful order.",
    features: [
      "One vault owner",
      "Unlimited documents",
      "Up to five authorized viewers",
      "Encrypted cloud storage",
      "Priority support",
      "Entry amendment history",
    ],
    cta: "Begin with Family",
    flagship: true,
  },
  {
    name: "Safekeeping",
    price: "50",
    cadence: "per month · add-on",
    line: "When the originals themselves should be in our care.",
    features: [
      "Climate-controlled physical vault",
      "Registered location of record",
      "Priority retrieval service",
      "Annual inventory",
      "Insurance coverage",
      "Round-the-clock security",
    ],
    cta: "Add Safekeeping",
    flagship: false,
  },
];

export default function Plans() {
  return (
    <Layout>
      <div className="container py-16 md:py-24">
        <header className="max-w-3xl fade-in-up">
          <p className="eyebrow mb-5">Subscriptions</p>
          <h1 className="display-serif text-5xl md:text-7xl leading-[0.96] text-balance">
            A single monthly rate. <br />
            <span className="italic-serif text-seal">Cancel whenever.</span>
          </h1>
          <p className="mt-6 text-lg text-ink-muted max-w-xl">
            Sealed offers three plans. Each is billed in confidence, and you
            may step back from any of them without question or penalty.
          </p>
        </header>

        <div className="rule my-14" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-[1px] bg-hairline border border-hairline fade-in-up delay-200">
          {plans.map((p) => (
            <article
              key={p.name}
              className={`p-10 flex flex-col ${
                p.flagship ? "bg-paper-alt" : "bg-paper"
              }`}
            >
              <div className="flex items-baseline justify-between mb-6">
                <h3 className="font-serif text-3xl tracking-tight">{p.name}</h3>
                {p.flagship && <span className="eyebrow text-seal">Most chosen</span>}
              </div>
              <div className="mb-5">
                <span className="italic-serif text-3xl text-ink-muted align-top mr-1">
                  $
                </span>
                <span
                  className="display-serif text-7xl text-ink tnum"
                  style={{ fontVariationSettings: "'opsz' 144" }}
                >
                  {p.price}
                </span>
                <span className="ml-2 text-ink-muted">{p.cadence}</span>
              </div>
              <p className="italic-serif text-ink-muted mb-10 text-[17px] leading-relaxed">
                {p.line}
              </p>
              <ul className="space-y-3.5 mb-10 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-baseline gap-3 text-[15px]">
                    <span className="text-seal text-xs shrink-0">✦</span>
                    <span className="text-ink">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                className={p.flagship ? "btn-ink" : "btn-ghost"}
              >
                {p.cta}
              </Link>
            </article>
          ))}
        </div>

        <div className="mt-20 border-t border-hairline-soft pt-12 grid grid-cols-1 md:grid-cols-3 gap-10">
          {[
            {
              q: "What happens if I stop paying?",
              a: "Your vault is preserved, read-only, for ninety days. You may resume at any point. After ninety days, your entries are permanently removed.",
            },
            {
              q: "May I change my plan?",
              a: "Yes. You may change between plans at any time; the price is prorated and cancellation takes effect at the end of the period.",
            },
            {
              q: "Is there a free trial?",
              a: "We offer a fourteen-day consideration period on every plan. You will not be charged until the fifteenth day.",
            },
          ].map((faq) => (
            <div key={faq.q}>
              <h4 className="font-serif text-xl tracking-tight mb-2">{faq.q}</h4>
              <p className="italic-serif text-ink-muted leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
