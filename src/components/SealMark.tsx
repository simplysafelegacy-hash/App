/**
 * SealMark — the brand mark. A filled circle with a serif "S", paired
 * with the wordmark when withWord is true.
 */
export function SealMark({
  size = 36,
  withWord = true,
  className = "",
}: {
  size?: number;
  withWord?: boolean;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="20" cy="20" r="20" fill="hsl(var(--primary))" />
        <text
          x="20"
          y="27"
          textAnchor="middle"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          fontSize="22"
          fontWeight="700"
          fill="hsl(var(--primary-foreground))"
        >
          S
        </text>
      </svg>
      {withWord && (
        <span className="text-lg font-semibold tracking-tight text-foreground">
          Simply Safe Legacy
        </span>
      )}
    </div>
  );
}
