import Link from "next/link";
import { Card } from "@/components/ui/card";
import { SLICE_LABELS, SLICE_ORDER, SLICE_TABS, type SliceId, type SliceResult } from "@/lib/scoring/types";
import { RISK_WORD } from "@/lib/ui";
import { Rosette } from "./rosette";
import { SliceDot } from "./slice-dot";

export function RosetteCard({
  slices,
  slug,
  ticker,
}: {
  slices: Record<SliceId, SliceResult>;
  slug: string;
  ticker: string;
}) {
  return (
    <Card title="Risk rosette" description="Green doesn't mean safe. Each slice describes one checkable risk.">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start xl:flex-col xl:items-center 2xl:flex-row 2xl:items-start">
        <Rosette slices={slices} ticker={ticker} />
        <ul className="w-full min-w-0 flex-1 space-y-2.5">
          {SLICE_ORDER.map((id) => {
            const s = slices[id];
            return (
              <li key={id}>
                <Link href={`/assets/${slug}/${SLICE_TABS[id]}`} className="group block">
                  <div className="flex items-center justify-between gap-2">
                    <SliceDot color={s.color} label={<span className="text-body font-medium text-fg group-hover:text-accent">{SLICE_LABELS[id]}</span>} />
                    <span className="text-label text-fg-subtle">{RISK_WORD[s.color]}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 pl-3.5 text-small text-fg-muted">{s.headline}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
