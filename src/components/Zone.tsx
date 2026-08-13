/**
 * A labeled section of the dashboard — an uppercase eyebrow with a rule that
 * fills the remaining width. Groups related cards ("Core documents", "Your
 * lists", "People & access") so the page is scannable rather than one flat
 * stack of cards.
 */
export function Zone({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <span className="h-0.5 flex-1 bg-border" />
      </div>
      {children}
    </section>
  );
}
