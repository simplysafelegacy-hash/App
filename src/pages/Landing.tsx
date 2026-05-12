import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { SealMark } from "@/components/SealMark";

export default function Landing() {
  const { isAuthenticated, loading } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && isAuthenticated) navigate("/dashboard", { replace: true });
  }, [isAuthenticated, loading, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-10">
          <SealMark size={48} />
        </div>

        <div className="card-surface p-8 md:p-10">
          <h1 className="text-3xl font-bold text-center text-foreground mb-3">
            Welcome
          </h1>
          <p className="text-center text-muted-foreground mb-10">
            A private place to keep your wills, trusts, and estate documents.
          </p>

          <div className="space-y-3">
            <Link to="/signup" className="btn-primary w-full">
              Create an account
            </Link>
            <Link to="/login" className="btn-secondary w-full">
              Sign in
            </Link>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          © {new Date().getFullYear()} Simply Safe Legacy
        </p>
      </div>
    </div>
  );
}
