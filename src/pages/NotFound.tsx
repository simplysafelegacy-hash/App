import { Link, useLocation } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { SealMark } from "@/components/SealMark";
import { useEffect } from "react";

export default function NotFound() {
  const location = useLocation();
  useEffect(() => {
    console.error("404 — path not found:", location.pathname);
  }, [location.pathname]);

  return (
    <Layout showFooter={false}>
      <div className="container py-24 md:py-40 text-center">
        <SealMark withWord={false} size={56} className="mx-auto mb-10 fade-in" />
        <p className="eyebrow mb-5">Not on file</p>
        <h1 className="display-serif text-6xl md:text-8xl leading-[0.95] text-balance fade-in-up delay-100">
          This page is <br />
          <span className="italic-serif text-seal">nowhere to be found.</span>
        </h1>
        <p className="mt-8 text-lg italic-serif text-ink-muted max-w-md mx-auto fade-in-up delay-200">
          The address you've followed doesn't match any entry in our records.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center fade-in-up delay-300">
          <Link to="/" className="btn-ink">
            Back to the beginning
          </Link>
          <Link to="/dashboard" className="btn-ghost">
            Back to your vault
          </Link>
        </div>
      </div>
    </Layout>
  );
}
