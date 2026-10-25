import type { Source } from "../schema/sourced";

export type CategoryId = "underlying" | "legal" | "counterparties" | "control" | "transparency" | "pricing" | "exit";

export const CATEGORY_ORDER: CategoryId[] = ["underlying", "legal", "counterparties", "control", "transparency", "pricing", "exit"];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  underlying: "Underlying Asset",
  legal: "Legal Claim",
  counterparties: "Counterparties",
  control: "Control",
  transparency: "Transparency",
  pricing: "Pricing",
  exit: "Exit",
};

export type Color = "green" | "yellow" | "red";
export type Rating = Color | "unverified" | "not-assessed";

export interface Finding {
  id: string;
  /** green: the check passed. unknown: the information isn't public, so we couldn't check it. */
  color: Color | "unknown";
  /** For unknown findings: the color the check would get if the answer turned out badly. */
  worstCase?: Color;
  text: string;
  source?: Source;
}

export interface CategoryResult {
  category: CategoryId;
  rating: Rating;
  /** The worst color among the checks we could make. For `unverified`, the rating is at least this. */
  floor?: Color;
  headline: string;
  findings: Finding[];
  /** Facts shown next to the rating that don't change it. */
  context: string[];
}

const RANK: Record<Color, number> = { green: 0, yellow: 1, red: 2 };
const ORDER: Record<Finding["color"], number> = { red: 0, unknown: 1, yellow: 2, green: 3 };

export function worse(a: Color, b: Color): Color {
  return RANK[b] > RANK[a] ? b : a;
}

/**
 * Framework rule 5: unknown is its own state. A known red is red. Otherwise, if an unknown check could
 * turn out worse than what we know, the category is `unverified` (and `floor` says how bad it is at least).
 */
export function rateCategory(category: CategoryId, findings: Finding[], context: string[], greenHeadline: string): CategoryResult {
  const sorted = [...findings].sort((a, b) => ORDER[a.color] - ORDER[b.color]);
  const known = sorted.reduce<Color>((w, f) => (f.color === "unknown" ? w : worse(w, f.color)), "green");
  const open = sorted.filter((f) => f.color === "unknown" && RANK[f.worstCase ?? "red"] > RANK[known]);

  if (known !== "red" && open.length > 0) {
    const checked = sorted.some((f) => f.color !== "unknown");
    return { category, rating: "unverified", floor: checked ? known : undefined, headline: open[0].text, findings: sorted, context };
  }

  const lead = sorted.find((f) => f.color === known);
  return {
    category,
    rating: known,
    floor: known,
    headline: known === "green" ? greenHeadline : (lead?.text ?? greenHeadline),
    findings: sorted,
    context,
  };
}

export function notAssessed(category: CategoryId, headline: string): CategoryResult {
  return { category, rating: "not-assessed", headline, findings: [], context: [] };
}
