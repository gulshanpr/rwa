import type { Asset } from "./schema/asset";

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
