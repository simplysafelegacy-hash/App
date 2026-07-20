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
    <div className="pt-7 pb-7 md:pt-10 md:pb-8 border-b border-border mb-8">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="text-2xl md:text-3xl font-semibold text-foreground text-balance">
            {title}
          </h1>
          {lede && (
            <p className="mt-3 text-base text-muted-foreground text-pretty max-w-xl">
              {lede}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
