import { SLICE_LABELS, SLICE_ORDER, type SliceId, type SliceResult } from "@/lib/scoring/types";
import { RISK_FILL, RISK_WORD } from "@/lib/ui";

function point(cx: number, cy: number, r: number, deg: number): string {
  const rad = (deg * Math.PI) / 180;
  return `${(cx + r * Math.cos(rad)).toFixed(2)},${(cy + r * Math.sin(rad)).toFixed(2)}`;
}

export function Rosette({
  slices,
  size = "lg",
  ticker,
}: {
  slices: Record<SliceId, Pick<SliceResult, "color" | "headline">>;
  size?: "sm" | "lg";
  ticker?: string;
}) {
  const px = size === "sm" ? 24 : 220;
  const c = px / 2;
  const r = c - (size === "sm" ? 1 : 4);
  const gap = size === "sm" ? 1 : 3;
  const patternId = `hatch-${size}`;
  const summary = SLICE_ORDER.map((s) => `${SLICE_LABELS[s]}: ${RISK_WORD[slices[s].color]}`).join(", ");

  return (
    <svg
      width={px}
      height={px}
      viewBox={`0 0 ${px} ${px}`}
      role="img"
      aria-label={`${ticker ? `${ticker} risk rosette. ` : ""}${summary}`}
      className="shrink-0"
    >
      <defs>
        <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--risk-grey-soft)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--border-strong)" strokeWidth="2" />
        </pattern>
      </defs>
      {SLICE_ORDER.map((slice, i) => {
        const result = slices[slice];
        const step = 360 / SLICE_ORDER.length;
        const start = -90 - step / 2 + step * i;
        const fill = result.color === "grey" ? (size === "sm" ? "var(--border-strong)" : `url(#${patternId})`) : RISK_FILL[result.color];
        return (
          <polygon
            key={slice}
            points={`${c},${c} ${point(c, c, r, start)} ${point(c, c, r, start + step)}`}
            fill={fill}
            stroke="var(--surface)"
            strokeWidth={gap}
            strokeLinejoin="round"
          >
            <title>{`${SLICE_LABELS[slice]}: ${RISK_WORD[result.color]}. ${result.headline}`}</title>
          </polygon>
        );
      })}
      {size === "lg" && <circle cx={c} cy={c} r={14} fill="var(--surface)" />}
    </svg>
  );
}
