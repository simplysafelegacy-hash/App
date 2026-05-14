import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { SealMark } from "@/components/SealMark";

/**
 * Landing — public welcome / auth gateway.
 *
 * Two soft radial gradients tint the background green at the top and
 * faintly at the bottom; the card sits centered as a single elevated
 * surface. Logged-in users are bounced to the dashboard.
 */
export default function Landing() {
  const { isAuthenticated, loading } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && isAuthenticated) navigate("/dashboard", { replace: true });
  }, [isAuthenticated, loading, navigate]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background"
      style={{
        // Subtle sage-green wash at the top fading down, with a quieter
        // counterpart at the bottom — anchors the card without becoming
        // a "feature" of its own.
        backgroundImage:
          "radial-gradient(ellipse 80% 55% at 50% -10%, hsl(155 30% 82% / 0.35), transparent 65%), radial-gradient(ellipse 60% 40% at 50% 110%, hsl(155 25% 78% / 0.18), transparent 70%)",
      }}
    >
      <div className="w-full" style={{ maxWidth: 420 }}>
        {/* Brand block — seal + wordmark, then a small muted tagline. */}
        <div className="flex flex-col items-center gap-2 mb-9">
          <SealMark size={44} />
          <p className="text-[13px] text-muted-foreground tracking-tight">
            Secure estate document access.
          </p>
        </div>

        {/* The auth card. White on cream gives a subtle tonal lift; the
            shadow is deliberately diffuse to read as elevation, not
            material weight. */}
        <div
          className="bg-card border border-border/60"
          style={{
            borderRadius: 20,
            padding: "40px",
            boxShadow:
              "0 1px 2px rgba(20, 39, 32, 0.04), 0 16px 40px rgba(20, 39, 32, 0.07)",
          }}
        >
          <h1 className="text-[28px] font-semibold text-center text-foreground tracking-tight mb-3">
            Welcome
          </h1>
          <p className="text-center text-muted-foreground leading-relaxed mb-9">
            Keep your wills, trusts, and estate records secure, organized,
            and accessible to the right people.
          </p>

          <div className="space-y-3">
            <Link to="/signup" className="btn-primary w-full !rounded-[12px]">
              Get started
            </Link>
            <Link to="/login" className="btn-secondary w-full !rounded-[12px]">
              Sign in
            </Link>
          </div>

          <p className="text-center text-[13px] text-muted-foreground mt-7 leading-relaxed">
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
