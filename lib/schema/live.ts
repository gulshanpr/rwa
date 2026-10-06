import { z } from "zod";
import { Address } from "./sourced";
import { Chain } from "./asset";

const DefiMarket = z.object({
  marketId: z.string(),
  protocol: z.enum(["morpho", "aave", "euler"]),
  name: z.string(),
  chain: Chain,
  loanAsset: z.string(),
  lltv: z.number().min(0).max(1),
  oracle: z.object({
    address: Address,
    type: z.enum(["fixed", "nav-feed", "market"]),
    description: z.string(),
  }),
  collateralUsd: z.number(),
  borrowUsd: z.number(),
  supplyUsd: z.number(),
  url: z.url(),
});

export const LiveSchema = z.object({
  asset: z.string(),
  sample: z.boolean().default(false),
  asOf: z.iso.datetime(),
  supply: z.array(
    z.object({
      chain: Chain,
      totalSupply: z.number(),
      priceUsd: z.number(),
      source: z.string(),
    }),
  ),
  aum: z.object({
    usd: z.number(),
    usd30dAgo: z.number(),
    source: z.object({ name: z.string(), url: z.url() }),
  }),
  oracle: z.object({
    chain: Chain,
    address: Address,
    value: z.number(),
    updatedAt: z.iso.datetime(),
  }),
  defiMarkets: z.array(DefiMarket),
  defiSource: z.object({ name: z.string(), url: z.url() }),
});

export const AlertSchema = z.object({
  id: z.string(),
  asset: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  kind: z.enum([
    "upgrade",
    "admin-change",
    "role-grant",
    "role-revoke",
    "ownership-transfer",
    "pause",
    "safe-change",
    "mint",
    "burn",
    "oracle-stale",
  ]),
  title: z.string(),
  consequence: z.string(),
  chain: Chain,
  contract: Address,
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  block: z.number().int(),
  publishedAt: z.iso.datetime(),
});

export const AlertsFileSchema = z.object({
  sample: z.boolean().default(false),
  alerts: z.array(AlertSchema),
});

export type Live = z.infer<typeof LiveSchema>;
export type DefiMarket = z.infer<typeof DefiMarket>;
export type Alert = z.infer<typeof AlertSchema>;
export type AlertSeverity = Alert["severity"];
