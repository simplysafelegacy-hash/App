import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";

export default function Landing() {
  return (
    <Layout>
      <Hero />
      <Invocation />
      <HowItWorks />
      <WhatBelongs />
      <Security />
      <Pricing />
      <ClosingInvite />
    </Layout>
  );
}

/* ───────────────────────────── HERO ───────────────────────────── */

function Hero() {
  return (
    <section className="relative">
      <div className="container pt-16 md:pt-24 pb-20 md:pb-32">
        {/* Folio header — ledger-style metadata */}
        <div className="flex items-start justify-between mb-16 fade-in">
          <div>
            <p className="eyebrow mb-1">Folio № I</p>
            <p className="text-sm text-ink-subtle italic-serif">Est. two thousand twenty-six</p>
          </div>
          <div className="text-right">
            <p className="eyebrow mb-1">Private &amp; Confidential</p>
            <p className="text-sm text-ink-subtle italic-serif">For the one who prepares</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-end">
          <div className="lg:col-span-8 fade-in-up delay-100">
            <h1 className="display-serif text-[54px] leading-[0.98] sm:text-6xl md:text-7xl lg:text-[104px] lg:leading-[0.94] text-ink">
              The quiet place <br />
              for the papers <br />
              <span className="italic-serif text-seal" style={{ fontVariationSettings: "initial" }}>
                that matter most.
              </span>
            </h1>
          </div>

          <div className="lg:col-span-4 fade-in-up delay-300">
            <div className="rule mb-6" />
            <p className="text-lg text-ink-muted leading-relaxed text-pretty">
              Record where your will rests. Name who may see it. Keep everything
              sealed until the moment it is needed — so the people you love are
              never left searching.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/signup" className="btn-ink flex-1 sm:flex-none">
                Open a vault
              </Link>
              <Link to="/login" className="btn-ghost flex-1 sm:flex-none">
                I already have one
              </Link>
            </div>
            <p className="mt-5 text-xs text-ink-subtle tracking-wide">
              No credit card required · 14-day consideration
            </p>
          </div>
        </div>

        {/* Hero artifact — letterhead motif */}
        <div className="mt-20 md:mt-28 fade-in delay-500">
          <LetterArtifact />
        </div>
      </div>
    </section>
  );
}

function LetterArtifact() {
  return (
    <div className="relative max-w-4xl mx-auto">
      <div className="relative paper-card p-10 md:p-16" style={{ borderRadius: "2px" }}>
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="eyebrow mb-2">Specimen · A private entry</p>
            <p
              className="font-serif text-2xl text-ink tracking-tight"
              style={{ fontVariationSettings: "'opsz' 48" }}
            >
              Last Will &amp; Testament
            </p>
          </div>
          <div
            className="seal-mark shrink-0"
            style={{
              width: 72,
              height: 72,
              fontSize: 32,
              transform: "rotate(-8deg)",
              boxShadow: "inset 0 0 0 2px hsl(var(--paper)/.2), 0 2px 8px hsl(36 12% 9%/.12)",
            }}
          >
            S
          </div>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-12">
          <div>
            <dt className="eyebrow mb-1.5">Physical location</dt>
            <dd className="text-ink text-[17px]">Black fireproof safe · Top shelf</dd>
            <dd className="text-ink-muted text-sm mt-0.5">14 Oak Ridge Drive</dd>
          </div>
          <div>
            <dt className="eyebrow mb-1.5">Digital copy</dt>
            <dd className="text-ink text-[17px]">will_2026.pdf</dd>
            <dd className="text-ink-muted text-sm mt-0.5">Encrypted · Sealed until requested</dd>
          </div>
          <div>
            <dt className="eyebrow mb-1.5">Authorized to view</dt>
            <dd className="text-ink text-[17px]">Michael Mitchell</dd>
            <dd className="text-ink-muted text-sm mt-0.5">Son · Emergency contact</dd>
          </div>
          <div>
            <dt className="eyebrow mb-1.5">Last updated</dt>
            <dd className="text-ink text-[17px] tnum">15 January 2026</dd>
            <dd className="text-ink-muted text-sm mt-0.5 italic-serif">By the owner</dd>
          </div>
        </dl>
        <div className="rule mt-10 mb-6" />
        <p className="italic-serif text-ink-muted text-center">
          An example of what a single entry looks like in your vault.
        </p>
      </div>

      {/* Paper corner fold */}
      <div
        className="absolute -bottom-2 -right-2 w-16 h-16 pointer-events-none"
        style={{
          background: "linear-gradient(135deg, transparent 50%, hsl(var(--hairline-soft)) 50%)",
          clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
          opacity: 0.6,
        }}
      />
    </div>
  );
}

/* ───────────────────────────── INVOCATION ───────────────────────────── */

function Invocation() {
  return (
    <section className="py-24 md:py-32 relative">
      <div className="container text-center max-w-4xl mx-auto">
        <p
          className="italic-serif text-2xl md:text-4xl text-ink-muted leading-[1.35] text-balance"
          style={{ letterSpacing: "-0.015em" }}
        >
          “When the time comes, the worst thing to hand the ones you love is a
          house full of drawers to open. The second worst is no idea where to
          begin.”
        </p>
        <p className="mt-8 eyebrow">— The case for keeping it somewhere</p>
      </div>
    </section>
  );
}

/* ───────────────────────────── HOW IT WORKS ───────────────────────────── */

const steps = [
  {
    num: "I",
    title: "Open a vault",
    body:
      "In a few minutes, record your name, your emergency contact, and the address where you keep your papers.",
  },
  {
    num: "II",
    title: "Enter what you have",
    body:
      "For each document — will, trust, deed, policy — note where the original sits and upload a digital copy if you wish.",
  },
  {
    num: "III",
    title: "Name who may see",
    body:
      "Invite the people who should know — a spouse, an executor, a solicitor — and grant access to the documents you choose.",
  },
];

function HowItWorks() {
  return (
    <section className="py-24 md:py-28 border-t border-hairline-soft">
      <div className="container">
        <header className="max-w-3xl mb-16 md:mb-20">
          <p className="eyebrow mb-5">The practice</p>
          <h2 className="display-serif text-4xl md:text-5xl text-balance">
            Three quiet steps. <br />
            Nothing elaborate.
          </h2>
        </header>

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-12">
          {steps.map((s, i) => (
            <li key={s.num} className="relative">
              <div className="flex items-baseline gap-5 mb-5">
                <span
                  className="font-serif text-seal text-5xl tnum"
                  style={{ fontVariationSettings: "'opsz' 144" }}
                >
                  {s.num}.
                </span>
                <div className="flex-1 rule mt-4" />
              </div>
              <h3 className="font-serif text-2xl mb-3 tracking-tight">{s.title}</h3>
              <p className="text-ink-muted leading-relaxed max-w-sm">{s.body}</p>
              {i < steps.length - 1 && (
                <span className="hidden md:block absolute top-6 -right-5 text-ink-subtle font-serif">
                  ·
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────────────────────────── WHAT BELONGS ───────────────────────────── */

const documents = [
  { n: "01", name: "Last Will & Testament", note: "The central instrument" },
  { n: "02", name: "Durable Power of Attorney", note: "Financial authority" },
  { n: "03", name: "Living Will", note: "Medical wishes" },
  { n: "04", name: "Revocable Trust", note: "Property & successorship" },
  { n: "05", name: "Property Deeds", note: "Real estate titles" },
  { n: "06", name: "Life Insurance Policies", note: "Beneficiaries named" },
  { n: "07", name: "Beneficiary Forms", note: "Retirement, accounts" },
  { n: "08", name: "Other Papers", note: "Letters, instructions" },
];

function WhatBelongs() {
  return (
    <section className="py-24 md:py-28 bg-paper-sunk/30 border-y border-hairline-soft">
      <div className="container">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <header className="lg:col-span-4">
            <p className="eyebrow mb-5">What belongs here</p>
            <h2 className="display-serif text-4xl md:text-5xl leading-[1.02] text-balance">
              A ledger of every paper that speaks for you.
            </h2>
            <p className="mt-6 text-ink-muted leading-relaxed max-w-sm">
              Record the originals in any safe, any bank, any solicitor's
              office — or store them with us for safekeeping.
            </p>
          </header>

          <div className="lg:col-span-8">
            <ul className="divide-y divide-hairline">
              {documents.map((d) => (
                <li
                  key={d.n}
                  className="flex items-baseline justify-between gap-6 py-5 group hover:bg-paper-alt/50 transition-colors px-2 -mx-2"
                >
                  <span className="eyebrow text-ink-subtle tnum shrink-0">
                    {d.n}
                  </span>
                  <span
                    className="flex-1 font-serif text-xl md:text-2xl tracking-tight group-hover:text-seal transition-colors"
                    style={{ fontVariationSettings: "'opsz' 36" }}
                  >
                    {d.name}
                  </span>
                  <span className="italic-serif text-ink-subtle text-right shrink-0 hidden sm:block">
                    {d.note}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── SECURITY ───────────────────────────── */

function Security() {
  return (
    <section className="py-24 md:py-28">
      <div className="container">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">
          <div>
            <p className="eyebrow mb-5">How it is kept</p>
            <h2 className="display-serif text-4xl md:text-5xl leading-[1.02] text-balance">
              The same care a solicitor would give it.
            </h2>
            <p className="mt-6 text-lg text-ink-muted leading-relaxed max-w-md">
              Nothing is broadcast. Nothing is indexed. Every paper and every
              address you enter is encrypted at rest and released only to the
              people whose names you have written down.
            </p>
          </div>
          <dl className="space-y-8">
            {[
              {
                t: "End-to-end encryption",
                d: "Documents are encrypted before they leave your device and remain encrypted in storage.",
              },
              {
                t: "No third-party sharing",
                d: "We do not share, sell, or monetize your data. We hold it in trust.",
              },
              {
                t: "Granular access",
                d: "You choose, per document, which of your authorized viewers may see it.",
              },
              {
                t: "An audit trail",
                d: "Every access, every change, every release is recorded for your review.",
              },
            ].map((item) => (
              <div key={item.t} className="flex gap-6">
                <div className="shrink-0 mt-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-seal" />
                </div>
                <div>
                  <dt className="font-serif text-xl mb-1.5 tracking-tight">
                    {item.t}
                  </dt>
                  <dd className="text-ink-muted leading-relaxed">{item.d}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── PRICING ───────────────────────────── */

const plans = [
  {
    name: "Individual",
    price: "15",
    cadence: "per month",
    line: "Perfect for personal estate planning.",
    features: ["One vault owner", "Unlimited documents", "Two authorized viewers"],
    flagship: false,
  },
  {
    name: "Family",
    price: "25",
    cadence: "per month",
    line: "For families that want clarity across generations.",
    features: [
      "One vault owner",
      "Unlimited documents",
      "Up to five authorized viewers",
      "Priority support",
    ],
    flagship: true,
  },
  {
    name: "Safekeeping",
    price: "50",
    cadence: "per month · add-on",
    line: "Your originals, held in our physical vault.",
    features: [
      "Climate-controlled storage",
      "Registered location of record",
      "Priority retrieval",
      "Annual inventory",
    ],
    flagship: false,
  },
];

function Pricing() {
  return (
    <section className="py-24 md:py-28 border-t border-hairline-soft">
      <div className="container">
        <header className="max-w-3xl mb-16">
          <p className="eyebrow mb-5">Subscriptions</p>
          <h2 className="display-serif text-4xl md:text-5xl text-balance">
            A single monthly rate. <br />
            Cancel whenever you wish.
          </h2>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-[1px] bg-hairline border border-hairline">
          {plans.map((p) => (
            <article
              key={p.name}
              className={`p-8 md:p-10 flex flex-col ${
                p.flagship ? "bg-paper-alt" : "bg-paper"
              }`}
            >
              <div className="flex items-baseline justify-between mb-6">
                <h3 className="font-serif text-2xl tracking-tight">{p.name}</h3>
                {p.flagship && (
                  <span className="eyebrow text-seal">Most chosen</span>
                )}
              </div>
              <div className="mb-5">
                <span className="italic-serif text-2xl text-ink-muted align-top mr-1">$</span>
                <span
                  className="display-serif text-6xl text-ink tnum"
                  style={{ fontVariationSettings: "'opsz' 144" }}
                >
                  {p.price}
                </span>
                <span className="ml-2 text-ink-muted">{p.cadence}</span>
              </div>
              <p className="italic-serif text-ink-muted mb-8">{p.line}</p>
              <ul className="space-y-3 mb-10 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-baseline gap-3 text-[15px]">
                    <span className="text-seal text-xs">✦</span>
                    <span className="text-ink">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                className={p.flagship ? "btn-ink" : "btn-ghost"}
              >
                Begin with {p.name}
              </Link>
            </article>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-ink-subtle italic-serif">
          All plans include encryption, audit trail, and twenty-four-hour
          support.
        </p>
      </div>
    </section>
  );
}

/* ───────────────────────────── CLOSING ───────────────────────────── */

function ClosingInvite() {
  return (
    <section className="py-28 md:py-40 border-t border-hairline-soft relative overflow-hidden">
      <div className="container relative">
        <div className="max-w-4xl mx-auto text-center">
          <div
            className="seal-mark mx-auto mb-10"
            style={{
              width: 88,
              height: 88,
              fontSize: 42,
              transform: "rotate(-4deg)",
              boxShadow: "inset 0 0 0 2px hsl(var(--paper)/.2), 0 4px 14px hsl(36 12% 9%/.15)",
            }}
          >
            S
          </div>
          <h2 className="display-serif text-5xl md:text-7xl leading-[0.95] text-balance">
            Leave things <br />
            <span className="italic-serif text-seal">in good order.</span>
          </h2>
          <p className="mt-8 text-lg text-ink-muted max-w-lg mx-auto text-pretty">
            It takes an afternoon. It will mean everything to the people who
            come after.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/signup" className="btn-ink">
              Open a vault
            </Link>
            <Link to="/plans" className="btn-ghost">
              See the subscriptions
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
