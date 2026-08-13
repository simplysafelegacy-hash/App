import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { AuthLayout } from "@/components/layout/AuthLayout";

/**
 * Landing — public welcome / auth gateway. Shares the split-screen AuthLayout
 * with the sign-in and sign-up pages so the first screen matches the rest.
 *
 * Logged-in users are bounced to the dashboard.
 */
export default function Landing() {
  const { isAuthenticated, loading } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && isAuthenticated) navigate("/dashboard", { replace: true });
  }, [isAuthenticated, loading, navigate]);

  return (
    <AuthLayout
      title="Welcome"
      subtitle="Keep your wills, trusts, and estate records secure, organized, and accessible to the right people."
    >
      <div className="space-y-3">
        <Link to="/signup" className="btn-primary w-full">
          Get started
        </Link>
        <Link to="/login" className="btn-secondary w-full">
          Sign in
        </Link>
      </div>

      <p className="text-center text-base text-muted-foreground mt-8">
        Private by design. Access controlled by you.
      </p>
    </AuthLayout>
  );
}
