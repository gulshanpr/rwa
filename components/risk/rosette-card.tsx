import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  CATEGORY_TABS,
  type CategoryId,
  type CategoryResult,
} from "@/lib/framework/types";
import { ratingWord } from "@/lib/ui";
import { RiskDot } from "./risk-dot";
import { Rosette } from "./rosette";

export function RosetteCard({
  categories,
  slug,
  ticker,
}: {
  categories: Record<CategoryId, CategoryResult>;
  slug: string;
  ticker: string;
}) {
  return (
    <Card
      title="Risk rosette"
      description="Seven risks: the real asset, who you have to trust, and whether you can get out in time."
    >
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start xl:flex-col xl:items-center 2xl:flex-row 2xl:items-start">
        <Rosette slices={categories} ticker={ticker} />
        <ul className="w-full min-w-0 flex-1 space-y-2.5">
          {CATEGORY_ORDER.map((id) => {
            const c = categories[id];
            return (
              <li key={id}>
                <Link href={`/assets/${slug}/${CATEGORY_TABS[id]}`} className="group block">
                  <div className="flex items-center justify-between gap-2">
                    <RiskDot
                      color={c.rating}
                      label={
                        <span className="text-body font-medium text-fg group-hover:text-accent">
                          {CATEGORY_LABELS[id]}
                        </span>
                      }
                    />
                    <span className="text-label text-fg-subtle">{ratingWord(c)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 pl-3.5 text-small text-fg-muted">{c.headline}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
