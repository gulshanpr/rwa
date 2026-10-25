import { clsx, type ClassValue } from "clsx";
import type { CategoryResult, Rating, Tone } from "./framework/types";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Everything that can be drawn as a risk dot: a category rating, or a tone for powers, flags and alerts. */
export type RiskVisual = Rating | Tone;

export const RISK_DOT: Record<RiskVisual, string> = {
  green: "bg-risk-green",
  yellow: "bg-risk-yellow",
  red: "bg-risk-red",
  unverified: "bg-transparent border-[1.5px] border-dashed border-fg-muted",
  "not-assessed": "bg-risk-grey-soft ring-1 ring-inset ring-line-strong",
  grey: "bg-transparent ring-[1.5px] ring-inset ring-risk-grey",
};

export const RISK_SOFT: Record<RiskVisual, string> = {
  green: "bg-risk-green-soft text-fg border-risk-green/30",
  yellow: "bg-risk-yellow-soft text-fg border-risk-yellow/40",
  red: "bg-risk-red-soft text-fg border-risk-red/30",
  unverified: "bg-surface text-fg border-dashed border-fg-subtle",
  "not-assessed": "bg-risk-grey-soft text-fg-muted border-line",
  grey: "bg-risk-grey-soft text-fg-muted border-line",
};

export const RISK_FILL: Record<"green" | "yellow" | "red" | "grey", string> = {
  green: "var(--risk-green)",
  yellow: "var(--risk-yellow)",
  red: "var(--risk-red)",
  grey: "var(--risk-grey-soft)",
};

export const RISK_WORD: Record<RiskVisual, string> = {
  green: "Green",
  yellow: "Yellow",
  red: "Red",
  unverified: "Unverified",
  "not-assessed": "Not assessed",
  grey: "Not rated",
};

/** "Unverified, at least yellow" when we know the floor. */
export function ratingWord(r: Pick<CategoryResult, "rating" | "floor">): string {
  return r.rating === "unverified" && r.floor && r.floor !== "green" ? `Unverified · at least ${r.floor}` : RISK_WORD[r.rating];
}

export const SEVERITY_COLOR = {
  critical: "red",
  high: "yellow",
  medium: "grey",
  low: "grey",
} as const satisfies Record<string, Tone>;
