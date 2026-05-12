/**
 * SealMark — the wax-seal wordmark.
 * A thin-ringed circle with an italic "S" — evokes a notary seal.
 */
export function SealMark({
  size = 40,
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
        {/* outer ring */}
        <circle
          cx="20"
          cy="20"
          r="18.5"
          stroke="hsl(var(--ink))"
          strokeWidth="1"
        />
        {/* inner ring — thin */}
        <circle
          cx="20"
          cy="20"
          r="15.5"
          stroke="hsl(var(--ink))"
          strokeWidth="0.5"
        />
        {/* tiny tick marks at cardinal points */}
        <line x1="20" y1="3" x2="20" y2="5" stroke="hsl(var(--ink))" strokeWidth="0.6" />
        <line x1="20" y1="35" x2="20" y2="37" stroke="hsl(var(--ink))" strokeWidth="0.6" />
        <line x1="3" y1="20" x2="5" y2="20" stroke="hsl(var(--ink))" strokeWidth="0.6" />
        <line x1="35" y1="20" x2="37" y2="20" stroke="hsl(var(--ink))" strokeWidth="0.6" />
        {/* the S — italic serif */}
        <text
          x="20"
          y="26"
          textAnchor="middle"
          fontFamily="Fraunces, serif"
          fontStyle="italic"
          fontSize="17"
          fontWeight="500"
          fill="hsl(var(--ink))"
        >
          S
        </text>
      </svg>
      {withWord && (
        <span
          className="font-serif text-[22px] tracking-[-0.02em] text-ink"
          style={{ fontVariationSettings: "'opsz' 48, 'SOFT' 100" }}
        >
          Sealed
        </span>
      )}
    </div>
  );
}
