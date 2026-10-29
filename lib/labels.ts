import type { Asset, AssetClass } from "./schema/asset";

export const INVESTOR_LABELS: Record<Asset["access"]["investorType"]["value"], string> = {
  "qualified-purchaser": "Qualified purchasers",
  "accredited-investor": "Accredited investors",
  "non-us-professional": "Non-US professional investors",
  "non-us-persons": "Non-US persons",
  retail: "Retail",
};

export const TOKEN_STANDARD_LABELS: Record<Asset["tokenStandard"], string> = {
  "ds-protocol": "Securitize DS Protocol",
  erc3643: "ERC-3643 (T-REX)",
  erc4626: "ERC-4626 vault",
  "oz-erc20": "OpenZeppelin ERC-20",
  custom: "Custom",
};

export const PRICE_MODEL_LABELS: Record<Asset["priceModel"], string> = {
  "stable-nav": "Stable $1 NAV (yield paid as new tokens)",
  "accumulating-nav": "Accumulating NAV",
  market: "Market price",
};

export const WHO_CAN_REDEEM_LABELS: Record<Asset["exit"]["redemption"]["whoCanRedeem"]["value"], string> = {
  "all-holders": "Any holder",
  "whitelisted-holders": "Whitelisted holders",
  "issuer-approved": "Case-by-case, issuer approval",
};

export const PROTOCOL_LABELS = { morpho: "Morpho", aave: "Aave", euler: "Euler" } as const;

const LEGAL_SUFFIX = /,?\s+(Inc\.?|LLC|L\.?P\.?|Ltd\.?|Limited|SPC|GmbH)$/i;
const ROLE_SUFFIX = /\s+((Financial|Asset|Capital|Investment)\s+)?(Management|Advisers|Advisors)$/i;

/** "BlackRock Financial Management, Inc." → "BlackRock", for tables where the legal name doesn't fit. */
export function shortEntityName(name: string): string {
  return name.replace(LEGAL_SUFFIX, "").replace(ROLE_SUFFIX, "") || name;
}

export const FRESHNESS_LABELS: Record<Asset["freshnessClass"]["value"], string> = {
  "tbill-mmf": "T-bill or money market fund",
  "short-duration-credit": "Short-duration credit",
  "private-credit": "Private credit",
  "real-estate": "Real estate",
};

export const ASSET_CLASSES: Record<AssetClass, { label: string; short: string; path: string }> = {
  "us-treasuries": { label: "U.S. Treasuries", short: "Treasuries", path: "treasuries" },
  "private-credit": { label: "Private credit", short: "Private credit", path: "private-credit" },
};

export function assetClassFromPath(p: string): AssetClass | undefined {
  return (Object.keys(ASSET_CLASSES) as AssetClass[]).find((k) => ASSET_CLASSES[k].path === p);
}
