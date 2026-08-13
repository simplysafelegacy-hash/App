/**
 * A document/section status indicator. Encodes state in colour + a leading dot,
 * not just text, so it reads at a glance for an older audience.
 *
 *   done      → recorded / complete   (green tick)
 *   pending   → not yet recorded      (neutral outline — deliberately calm)
 *   attention → needs action / review (amber)
 */
export type StatusKind = "done" | "pending" | "attention";

const STYLES: Record<StatusKind, { wrap: string; dot: string }> = {
  done: {
    wrap: "bg-status-done/15 text-status-done",
    dot: "bg-status-done",
  },
  pending: {
    wrap: "bg-muted text-status-pending",
    dot: "border-2 border-status-pending",
  },
  attention: {
    wrap: "bg-status-attention/15 text-status-attention",
    dot: "bg-status-attention",
  },
};

export function StatusPill({
  kind,
  children,
}: {
  kind: StatusKind;
  children: React.ReactNode;
}) {
  const s = STYLES[kind];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold whitespace-nowrap ${s.wrap}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} aria-hidden />
      {children}
    </span>
  );
}
