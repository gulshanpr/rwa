import type { Source } from "../schema/sourced";

export type CategoryId = "underlying" | "legal" | "counterparties" | "control" | "transparency" | "pricing" | "exit";

/** Real asset, then who you trust, then whether you can see trouble coming and get out (framework.md). */
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

export const CATEGORY_SHORT: Record<CategoryId, string> = {
  underlying: "Backing",
  legal: "Legal",
  counterparties: "Parties",
  control: "Control",
  transparency: "Transp.",
  pricing: "Pricing",
  exit: "Exit",
};

export const CATEGORY_QUESTIONS: Record<CategoryId, string> = {
  underlying: "What backs the token, and how likely is it to lose value?",
  legal: "If the issuer goes bankrupt, do holders still own the assets?",
  counterparties: "Which offchain companies could fail, even if the asset is fine?",
  control: "Who can freeze, mint, pause or upgrade, and what stops them?",
  transparency: "Can you see what backs the token, and trust that data?",
  pricing: "Is the onchain price right, fresh, and hard to manipulate?",
  exit: "How fast can a holder, or a liquidator, get out?",
};

/** Asset page tab for each category. */
export const CATEGORY_TABS: Record<CategoryId, string> = {
  underlying: "underlying",
  legal: "legal",
  counterparties: "counterparties",
  control: "control",
  transparency: "transparency",
  pricing: "pricing",
  exit: "exit",
};

export type Color = "green" | "yellow" | "red";
export type Rating = Color | "unverified" | "not-assessed";
/** A color for things that aren't category ratings (powers, flags, alerts). grey is neutral. */
export type Tone = Color | "grey";

export interface Finding {
  id: string;
  category: CategoryId;
  /** green: the check passed. unknown: the information isn't public, so we couldn't check it. */
  color: Color | "unknown";
  /** For unknown findings: the color the check would get if the answer turned out badly. */
  worstCase?: Color;
  text: string;
  source?: Source;
}

/** A finding before rateCategory tags it with its category. */
export type Check = Omit<Finding, "category">;

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

/** Ranks ratings worst first, for sorting tables. */
export const RATING_RANK: Record<Rating, number> = { red: 4, unverified: 3, yellow: 2, green: 1, "not-assessed": 0 };

/**
 * Framework rule 5: unknown is its own state. A known red is red. Otherwise, if an unknown check could
 * turn out worse than what we know, the category is `unverified` (and `floor` says how bad it is at least).
 */
export function rateCategory(category: CategoryId, checks: Check[], context: string[], greenHeadline: string): CategoryResult {
  const sorted: Finding[] = [...checks].sort((a, b) => ORDER[a.color] - ORDER[b.color]).map((c) => ({ ...c, category }));
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

/**
 * Red, then unknown, then yellow findings across categories: what can go wrong, worst first. Within a
 * color, each category's first finding comes before any category's second, so one category with many
 * findings doesn't crowd out the rest.
 */
export function risksOf(categories: CategoryResult[]): Finding[] {
  const order = { red: 0, unknown: 1, yellow: 2, green: 3 };
  const ranked = categories.flatMap((c) => {
    const seen: Partial<Record<Finding["color"], number>> = {};
    return c.findings.filter((f) => f.color !== "green").map((f) => ({ f, nth: (seen[f.color] = (seen[f.color] ?? -1) + 1) }));
  });
  return ranked
    .sort((a, b) => order[a.f.color] - order[b.f.color] || a.nth - b.nth || CATEGORY_ORDER.indexOf(a.f.category) - CATEGORY_ORDER.indexOf(b.f.category))
    .map((x) => x.f);
}
