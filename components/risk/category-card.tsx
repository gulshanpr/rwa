import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { CATEGORY_LABELS, CATEGORY_QUESTIONS, type CategoryResult } from "@/lib/framework/types";
import { ratingWord } from "@/lib/ui";
import { RiskList } from "./risk-list";

/** Top of every category tab: the rating, then every check behind it, then context that doesn't change it. */
export function CategoryCard({
  result,
  slug,
  children,
}: {
  result: CategoryResult;
  slug: string;
  children?: React.ReactNode;
}) {
  return (
    <Card
      title={CATEGORY_LABELS[result.category]}
      description={CATEGORY_QUESTIONS[result.category]}
      actions={<Tag variant={`risk-${result.rating}`}>{ratingWord(result)}</Tag>}
    >
      <p className="mb-4 text-body font-medium text-fg">{result.headline}</p>
      <RiskList findings={result.findings} slug={slug} empty="No checks recorded." />
      {result.context.length > 0 && (
        <ul className="mt-4 space-y-1.5 rounded-control bg-subtle px-3 py-2.5">
          {result.context.map((c) => (
            <li key={c} className="flex items-start gap-2 text-small text-fg-muted">
              <Info className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden />
              {c}
            </li>
          ))}
        </ul>
      )}
      {children}
    </Card>
  );
}
