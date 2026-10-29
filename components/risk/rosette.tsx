import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type CategoryId,
  type CategoryResult,
  type Color,
} from "@/lib/framework/types";
import { RISK_FILL, ratingWord } from "@/lib/ui";

type Slice = Pick<CategoryResult, "rating" | "floor" | "headline">;

function point(c: number, r: number, deg: number): string {
  const rad = (deg * Math.PI) / 180;
  return `${(c + r * Math.cos(rad)).toFixed(2)},${(c + r * Math.sin(rad)).toFixed(2)}`;
}

const SPAN = 360 / CATEGORY_ORDER.length;

/**
 * Seven wedges, one per category, Underlying Asset at the top and clockwise from there. Unverified
 * wedges are striped in their known floor color; Legal Claim, not assessed, is hatched grey.
 */
export function Rosette({
  slices,
  size = "lg",
  ticker,
}: {
  slices: Record<CategoryId, Slice>;
  size?: "sm" | "lg";
  ticker?: string;
}) {
  const small = size === "sm";
  const px = small ? 24 : 220;
  const c = px / 2;
  const r = c - (small ? 1 : 4);
  const summary = CATEGORY_ORDER.map((id) => `${CATEGORY_LABELS[id]}: ${ratingWord(slices[id])}`).join(", ");

  // Patterns only on the large rosette: it's drawn once per page, so its ids can't collide with a hidden copy.
  const stripe = (color: Color | "none") => `rosette-stripe-${color}`;
  const fill = (s: Slice): { fill: string; opacity?: number } => {
    if (s.rating === "unverified") {
      if (small)
        return s.floor ? { fill: RISK_FILL[s.floor], opacity: 0.35 } : { fill: "var(--text-subtle)", opacity: 0.45 };
      return { fill: `url(#${stripe(s.floor ?? "none")})` };
    }
    if (s.rating === "not-assessed") return { fill: small ? "var(--border-strong)" : "url(#rosette-hatch)" };
    return { fill: RISK_FILL[s.rating] };
  };

  return (
    <svg
      width={px}
      height={px}
      viewBox={`0 0 ${px} ${px}`}
      role="img"
      aria-label={`${ticker ? `${ticker} risk rosette. ` : ""}${summary}`}
      className="shrink-0"
    >
      {!small && (
        <defs>
          <pattern id="rosette-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--risk-grey-soft)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--border-strong)" strokeWidth="2" />
          </pattern>
          {(["green", "yellow", "red", "none"] as const).map((color) => (
            <pattern
              key={color}
              id={stripe(color)}
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="8" height="8" fill="var(--surface)" />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="8"
                stroke={color === "none" ? "var(--text-subtle)" : RISK_FILL[color]}
                strokeWidth="3.5"
              />
            </pattern>
          ))}
        </defs>
      )}
      {CATEGORY_ORDER.map((id, i) => {
        const s = slices[id];
        const start = -90 - SPAN / 2 + SPAN * i;
        const f = fill(s);
        return (
          <path
            key={id}
            d={`M${c},${c} L${point(c, r, start)} A${r},${r} 0 0 1 ${point(c, r, start + SPAN)} Z`}
            fill={f.fill}
            fillOpacity={f.opacity}
            stroke="var(--surface)"
            strokeWidth={small ? 1 : 3}
            strokeLinejoin="round"
          >
            <title>{`${CATEGORY_LABELS[id]}: ${ratingWord(s)}. ${s.headline}`}</title>
          </path>
        );
      })}
      {!small && <circle cx={c} cy={c} r={14} fill="var(--surface)" />}
    </svg>
  );
}
