import type { Asset } from "../schema/asset";
import type { Discovered } from "../schema/discovered";
import type { Live } from "../schema/live";
import { analyzePowers, scoreControl } from "./control";
import { scoreDisclosure } from "./disclosure";
import { scoreExit } from "./exit";
import { scorePricing } from "./pricing";
import { sortReasons, type AssetScore, type SliceResult } from "./types";
import { scoreVerification } from "./verification";

export const LEGAL_NOT_ASSESSED: SliceResult = {
  slice: "legal",
  color: "grey",
  headline:
    "Not assessed. We don't yet evaluate bankruptcy remoteness or holder claims. See what is disclosed in the Disclosure tab.",
  reasons: [],
};

export function scoreAsset(asset: Asset, discovered: Discovered[], live: Live | undefined): AssetScore {
  const slices = {
    control: scoreControl(analyzePowers(discovered), asset.ticker),
    pricing: scorePricing(asset, live),
    verification: scoreVerification(asset),
    exit: scoreExit(asset),
    disclosure: scoreDisclosure(asset),
    legal: LEGAL_NOT_ASSESSED,
  };
  const risks = sortReasons(Object.values(slices).flatMap((s) => s.reasons));
  return { slices, risks };
}

export * from "./types";
