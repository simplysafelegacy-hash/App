import { Link } from "react-router-dom";

/**
 * Split-screen shell for the auth pages (sign-in, sign-up, forgot-password).
 *
 * ~40% deep-green branding panel on the left; ~60% authentication panel on the
 * right, where the form sits directly on the warm off-white background (no
 * floating card). Quiet and premium: a plain wordmark, one restrained heading,
 * a trust line, and an almost-invisible texture — no illustrations, icons, or
 * decorative graphics. Collapses to a single centred column on mobile with the
 * wordmark retained.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[2fr_3fr]">
      {/* ── Branding panel (~40%) ───────────────────────────────────── */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-primary text-primary-foreground px-12 xl:px-16 py-14">
        {/* Barely-there texture: one faint light source, ~4%. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-1/4 -left-1/4 h-[36rem] w-[36rem] rounded-full opacity-[0.05] blur-3xl"
          style={{ background: "hsl(var(--primary-foreground))" }}
        />

        <Link
          to="/"
          className="relative text-lg font-semibold tracking-tight text-primary-foreground"
        >
          Simply Safe Legacy
        </Link>

        <div className="relative max-w-sm">
          <h2 className="text-4xl xl:text-[2.75rem] font-semibold leading-[1.12] tracking-tight text-balance text-primary-foreground">
            Your legacy,
            <br />
            securely organized.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-primary-foreground/80 text-pretty">
            Keep your most important documents and instructions accessible to
            the people you trust.
          </p>
        </div>

        <div className="relative space-y-1">
          <p className="text-sm font-medium text-primary-foreground/70">
            Private by design · Encrypted storage
          </p>
          <p className="text-sm text-primary-foreground/45">
            © {new Date().getFullYear()} Simply Safe Legacy
          </p>
        </div>
      </aside>

      {/* ── Authentication panel (~60%) ─────────────────────────────── */}
      <main className="flex flex-col items-center justify-center px-6 sm:px-8 py-14 bg-background">
        <div className="w-full max-w-[27rem]">
          {/* Wordmark for small screens (branding panel is hidden there). */}
          <Link
            to="/"
            className="mb-10 block text-center text-lg font-semibold tracking-tight text-foreground lg:hidden"
          >
            Simply Safe Legacy
          </Link>

          <header className="mb-8">
            <h1 className="text-[2rem] leading-tight font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">{subtitle}</p>
          </header>

          {children}
        </div>
      </main>
    </div>
  );
}
