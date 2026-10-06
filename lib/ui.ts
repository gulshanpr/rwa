import { clsx, type ClassValue } from "clsx";
import type { SliceColor } from "./scoring/types";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export const RISK_DOT: Record<SliceColor, string> = {
  green: "bg-risk-green",
  yellow: "bg-risk-yellow",
  red: "bg-risk-red",
  grey: "bg-transparent ring-[1.5px] ring-inset ring-risk-grey",
};

export const RISK_SOFT: Record<SliceColor, string> = {
  green: "bg-risk-green-soft text-fg border-risk-green/30",
  yellow: "bg-risk-yellow-soft text-fg border-risk-yellow/40",
  red: "bg-risk-red-soft text-fg border-risk-red/30",
  grey: "bg-risk-grey-soft text-fg-muted border-line",
};

export const RISK_FILL: Record<SliceColor, string> = {
  green: "var(--risk-green)",
  yellow: "var(--risk-yellow)",
  red: "var(--risk-red)",
  grey: "var(--risk-grey-soft)",
};

export const RISK_WORD: Record<SliceColor, string> = {
  green: "Green",
  yellow: "Yellow",
  red: "Red",
  grey: "Not assessed",
};

export const SEVERITY_COLOR = {
  critical: "red",
  high: "yellow",
  medium: "grey",
  low: "grey",
} as const satisfies Record<string, SliceColor>;
