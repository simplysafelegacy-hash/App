import { ReactNode } from "react";

export function PageHeader({
  title,
  lede,
  actions,
}: {
  title: string | ReactNode;
  lede?: string | ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="pt-8 pb-8 md:pt-12 md:pb-10 border-b border-border mb-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground text-balance">
            {title}
          </h1>
          {lede && (
            <p className="mt-3 text-lg text-muted-foreground text-pretty max-w-xl">
              {lede}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
