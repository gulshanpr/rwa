import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { SourceMarker } from "@/components/data/source-marker";
import { CATEGORY_LABELS, CATEGORY_TABS, type Finding } from "@/lib/framework/types";
import { RiskDot } from "./risk-dot";

const visual = (f: Finding) => (f.color === "unknown" ? "unverified" : f.color);

/**
 * Findings with their color. On the overview (`linkCategory`) each one links to its category tab;
 * inside a tab, passed checks are shown too, so the reader sees what was checked.
 */
export function RiskList({
  findings,
  slug,
  limit,
  linkCategory = false,
  empty = "No yellow or red findings.",
}: {
  findings: Finding[];
  slug: string;
  limit?: number;
  linkCategory?: boolean;
  empty?: string;
}) {
  const shown = limit ? findings.slice(0, limit) : findings;
  if (shown.length === 0) return <p className="text-small text-fg-muted">{empty}</p>;
  return (
    <ol className="divide-y divide-line">
      {shown.map((f) => (
        <li key={f.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
          <RiskDot color={visual(f)} title={f.color === "unknown" ? `Not public: could be ${f.worstCase ?? "red"}` : undefined} className="mt-1.5" />
          <p className="min-w-0 flex-1 text-body text-fg">
            {f.text}
            {!linkCategory && f.source && <SourceMarker source={f.source} />}
          </p>
          {linkCategory && (
            <Link
              href={`/assets/${slug}/${CATEGORY_TABS[f.category]}`}
              className="inline-flex shrink-0 items-center gap-0.5 text-label text-accent hover:underline"
              aria-label={`${CATEGORY_LABELS[f.category]}: details`}
            >
              {CATEGORY_LABELS[f.category]}
              <ArrowUpRight className="size-3.5" />
            </Link>
          )}
        </li>
      ))}
    </ol>
  );
}
