import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Reason } from "@/lib/scoring/types";
import { SliceDot } from "./slice-dot";

export function evidenceHref(slug: string, reason: Reason): string {
  const tab = reason.evidence.tab === "overview" ? "" : `/${reason.evidence.tab}`;
  return `/assets/${slug}${tab}${reason.evidence.anchor ? `#${reason.evidence.anchor}` : ""}`;
}

export function RiskList({
  reasons,
  slug,
  limit,
  showFix = false,
}: {
  reasons: Reason[];
  slug: string;
  limit?: number;
  /** Show what the issuer could change to clear each finding. */
  showFix?: boolean;
}) {
  const shown = limit ? reasons.slice(0, limit) : reasons;
  if (shown.length === 0) {
    return <p className="text-small text-fg-muted">No yellow or red findings.</p>;
  }
  return (
    <ol className="divide-y divide-line">
      {shown.map((r) => (
        <li key={r.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
          <SliceDot color={r.color} className="mt-1.5" />
          <div className="min-w-0 flex-1">
            <p className="text-body text-fg">{r.text}</p>
            {showFix && r.fix && (
              <p className="mt-0.5 text-small text-fg-muted">
                <span className="font-medium text-fg-subtle">How to fix: </span>
                {r.fix}
              </p>
            )}
          </div>
          <Link
            href={evidenceHref(slug, r)}
            className="inline-flex shrink-0 items-center gap-0.5 text-label text-accent hover:underline"
            aria-label={`Evidence: ${r.evidence.label}`}
          >
            Evidence
            <ArrowUpRight className="size-3.5" />
          </Link>
        </li>
      ))}
    </ol>
  );
}
