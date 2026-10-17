import type { Asset } from "../schema/asset";
import type { Discovered } from "../schema/discovered";
import type { Live } from "../schema/live";
import { analyzePowers, scoreControl } from "./control";
import { scoreDisclosure } from "./disclosure";
import { scoreExit } from "./exit";
import { scoreExitWindow } from "./exit-window";
import { withFix } from "./fixes";
import { scorePricing } from "./pricing";
import { stageOf } from "./stages";
import { SLICE_LABELS, sortReasons, worstColor, type AssetScore, type Reason, type SliceId, type SliceResult } from "./types";
import { scoreVerification } from "./verification";

export const LEGAL_NOT_ASSESSED: SliceResult = {
  slice: "legal",
  color: "grey",
  headline:
    "Not assessed. We don't evaluate bankruptcy remoteness or holder claims. See what is disclosed in the Disclosure tab.",
  reasons: [],
};

/** A tracked asset this one holds, already scored. */
export interface HeldAsset {
  ticker: string;
  score: AssetScore;
}

/** Slices whose red findings pass through to a fund that holds the token. */
const LOOK_THROUGH: SliceId[] = ["control", "verification"];

function lookThrough(asset: Asset, slices: Record<SliceId, SliceResult>, held: Map<string, HeldAsset>) {
  for (const h of asset.holdings ?? []) {
    const under = held.get(h.asset);
    if (!under) continue;
    for (const id of LOOK_THROUGH) {
      const u = under.score.slices[id];
      if (u.color !== "red") continue;
      const share = h.sharePct !== undefined ? ` (${h.sharePct}% of assets)` : "";
      const reason: Reason = {
        id: `${id}.look-through.${h.asset}`,
        slice: id,
        color: "yellow",
        text: `${asset.ticker} holds ${under.ticker}${share}, whose own ${SLICE_LABELS[id]} is red: ${u.headline.replace(/\.$/, "")}.`,
        critical: false,
        evidence: { tab: "overview", anchor: "holdings", label: `${under.ticker} holding` },
        fix: `Hold underlying funds whose ${SLICE_LABELS[id]} is not red, or publish why the exposure is limited.`,
      };
      const s = slices[id];
      const color = worstColor([s.color === "grey" ? "green" : s.color, "yellow"]);
      slices[id] = { ...s, color, headline: color === s.color ? s.headline : reason.text, reasons: [...s.reasons, reason] };
    }
  }
}

export function scoreAsset(asset: Asset, discovered: Discovered[], live: Live | undefined, held: Map<string, HeldAsset> = new Map()): AssetScore {
  const powers = analyzePowers(discovered, asset.bounds);
  const hasDiscovery = discovered.length > 0;
  const slices: Record<SliceId, SliceResult> = {
    control: scoreControl(powers, asset.ticker, { discovered, otherChains: asset.otherChains }),
    "exit-window": scoreExitWindow(asset, powers, hasDiscovery),
    pricing: scorePricing(asset, live),
    verification: scoreVerification(asset, live),
    exit: scoreExit(asset),
    disclosure: scoreDisclosure(asset),
    legal: LEGAL_NOT_ASSESSED,
  };
  lookThrough(asset, slices, held);
  for (const id of Object.keys(slices) as SliceId[]) slices[id] = { ...slices[id], reasons: slices[id].reasons.map(withFix) };
  const risks = sortReasons(Object.values(slices).flatMap((s) => s.reasons));
  const base = { slices, risks };
  return { ...base, stage: stageOf(asset, base, powers, hasDiscovery) };
}

export * from "./types";
