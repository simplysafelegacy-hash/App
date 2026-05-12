import { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: string;
  title: string | ReactNode;
  lede?: string | ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="pt-10 pb-10 md:pt-14 md:pb-12">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div className="max-w-2xl">
          {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
          <h1 className="display-serif text-4xl md:text-5xl text-ink text-balance">
            {title}
          </h1>
          {lede && (
            <p className="mt-5 text-lg text-ink-muted text-pretty max-w-xl">
              {lede}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
      <div className="mt-10 rule" />
    </div>
  );
}
