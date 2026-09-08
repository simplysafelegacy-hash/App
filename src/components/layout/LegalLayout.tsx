import { ReactNode } from "react";
import { Layout } from "./Layout";

/**
 * Reading shell for a legal document (Privacy Policy, Terms of Service).
 *
 * Long-form legal text is read, not skimmed, so the column is held to a
 * comfortable measure and the type is set larger than the app's default.
 * The section styling lives here rather than in each document so Privacy
 * and Terms cannot drift apart visually.
 */
export function LegalDocument({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <Layout>
      <div className="container py-12 md:py-16">
        <article
          className="
            mx-auto max-w-[46rem]
            [&_h2]:text-xl [&_h2]:md:text-2xl [&_h2]:font-semibold
            [&_h2]:text-foreground [&_h2]:mt-12 [&_h2]:mb-4
            [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground
            [&_h3]:mt-8 [&_h3]:mb-3
            [&_p]:text-base [&_p]:leading-relaxed [&_p]:text-muted-foreground
            [&_p]:mb-4
            [&_ul]:mb-4 [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:list-disc
            [&_li]:text-base [&_li]:leading-relaxed [&_li]:text-muted-foreground
            [&_li]:marker:text-border
            [&_a]:underline [&_a]:text-foreground
            [&_strong]:text-foreground [&_strong]:font-semibold
          "
        >
          <header className="mb-10 pb-8 border-b border-border">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Effective date: {effectiveDate}
            </p>
          </header>

          {children}
        </article>
      </div>
    </Layout>
  );
}
