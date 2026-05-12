import { Link, useLocation } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useEffect } from "react";

export default function NotFound() {
  const location = useLocation();
  useEffect(() => {
    console.error("404 — path not found:", location.pathname);
  }, [location.pathname]);

  return (
    <Layout showFooter={false}>
      <div className="container py-24 md:py-32 text-center max-w-xl mx-auto">
        <p className="text-sm font-medium text-muted-foreground mb-3">404</p>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
          Page not found
        </h1>
        <p className="text-lg text-muted-foreground mb-10">
          The address you've followed doesn't match anything in our records.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/" className="btn-primary">
            Go home
          </Link>
          <Link to="/dashboard" className="btn-secondary">
            Back to your vault
          </Link>
        </div>
      </div>
    </Layout>
  );
}
