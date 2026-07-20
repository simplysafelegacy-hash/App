import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { SealMark } from "@/components/SealMark";

/**
 * Landing — public welcome / auth gateway.
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
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10 bg-background">
      <div className="w-full" style={{ maxWidth: 400 }}>
        <div className="flex flex-col items-center gap-2 mb-8">
          <SealMark size={38} />
          <p className="text-xs text-muted-foreground">
            Secure estate document access.
          </p>
        </div>

        <div className="card-surface p-7">
          <h1 className="text-2xl font-semibold text-center text-foreground mb-3">
            Welcome
          </h1>
          <p className="text-center text-sm text-muted-foreground leading-relaxed mb-7">
            Keep your wills, trusts, and estate records secure, organized,
            and accessible to the right people.
          </p>

          <div className="space-y-3">
            <Link to="/signup" className="btn-primary w-full">
              Get started
            </Link>
            <Link to="/login" className="btn-secondary w-full">
              Sign in
            </Link>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6 leading-relaxed">
            Private by design. Access controlled by you.
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          © {new Date().getFullYear()} Simply Safe Legacy
        </p>
      </div>
    </div>
  );
}
