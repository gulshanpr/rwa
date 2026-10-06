export type SliceId = "control" | "pricing" | "verification" | "exit" | "disclosure" | "legal";
export type SliceColor = "green" | "yellow" | "red" | "grey";
export type TabId =
  | "overview"
  | "control"
  | "pricing"
  | "defi"
  | "verification"
  | "exit"
  | "disclosure"
  | "history"
  | "sources";

export const SLICE_ORDER: SliceId[] = ["control", "pricing", "verification", "exit", "disclosure", "legal"];

export const SLICE_LABELS: Record<SliceId, string> = {
  control: "Control",
  pricing: "Pricing",
  verification: "Verification",
  exit: "Exit",
  disclosure: "Disclosure",
  legal: "Legal & insolvency",
};

export const SLICE_TABS: Record<SliceId, TabId> = {
  control: "control",
  pricing: "pricing",
  verification: "verification",
  exit: "exit",
  disclosure: "disclosure",
  legal: "disclosure",
};

export interface Evidence {
  tab: TabId;
  anchor?: string;
  label: string;
}

export interface Reason {
  id: string;
  slice: SliceId;
  color: Exclude<SliceColor, "grey" | "green">;
  text: string;
  critical: boolean;
  evidence: Evidence;
}

export interface SliceResult {
  slice: SliceId;
  color: SliceColor;
  headline: string;
  reasons: Reason[];
}

export interface AssetScore {
  slices: Record<SliceId, SliceResult>;
  risks: Reason[];
}

const COLOR_RANK: Record<SliceColor, number> = { grey: 0, green: 1, yellow: 2, red: 3 };

export function worstColor(colors: SliceColor[], fallback: SliceColor = "green"): SliceColor {
  return colors.reduce((worst, c) => (COLOR_RANK[c] > COLOR_RANK[worst] ? c : worst), fallback);
}

export function sortReasons(reasons: Reason[]): Reason[] {
  return [...reasons].sort(
    (a, b) =>
      COLOR_RANK[b.color] - COLOR_RANK[a.color] ||
      Number(b.critical) - Number(a.critical) ||
      SLICE_ORDER.indexOf(a.slice) - SLICE_ORDER.indexOf(b.slice),
  );
}

export function sliceFromReasons(slice: SliceId, reasons: Reason[], greenHeadline: string): SliceResult {
  const sorted = sortReasons(reasons);
  const color = worstColor(sorted.map((r) => r.color));
  return { slice, color, headline: sorted[0]?.text ?? greenHeadline, reasons: sorted };
}
