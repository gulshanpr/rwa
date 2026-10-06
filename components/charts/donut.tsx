import { formatPct, formatUsd } from "@/lib/format";

export const CHART_PALETTE = [
  "#3B3BD9",
  "#6CA0F5",
  "#8E7CF0",
  "#36BFFA",
  "#F178B6",
  "#A6A3FF",
  "#7CD4C4",
  "#FDB97D",
  "#9CA3AF",
  "#C4B5FD",
];

export function Donut({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 52;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
      <svg viewBox="0 0 140 140" className="size-36 shrink-0 -rotate-90" role="img" aria-label={label}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-muted)" strokeWidth="18" />
        {data.map((d, i) => {
          const len = total ? (d.value / total) * circumference : 0;
          const el = (
            <circle
              key={d.label}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={CHART_PALETTE[i % CHART_PALETTE.length]}
              strokeWidth="18"
              strokeDasharray={`${Math.max(len - 1.5, 0)} ${circumference}`}
              strokeDashoffset={-offset}
            >
              <title>{`${d.label}: ${formatUsd(d.value)}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      </svg>
      <ul className="w-full space-y-1.5">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-small">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
            <span className="flex-1 text-fg">{d.label}</span>
            <span className="tnum text-fg-muted">{formatUsd(d.value)}</span>
            <span className="tnum w-12 text-right text-fg-subtle">{total ? formatPct(d.value / total, 0) : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
