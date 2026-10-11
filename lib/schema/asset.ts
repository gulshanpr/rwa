import { z } from "zod";
import { Address, Disclosed, IsoDate, Source, Sourced } from "./sourced";

export const Chain = z.enum(["ethereum", "arbitrum", "optimism", "base", "polygon", "avalanche"]);
export const AssetClass = z.enum(["us-treasuries", "private-credit"]);
export const TokenStandard = z.enum(["ds-protocol", "erc3643", "erc4626", "oz-erc20", "custom"]);
export const PriceModel = z.enum(["stable-nav", "accumulating-nav", "market"]);
export const InvestorType = z.enum([
  "qualified-purchaser",
  "accredited-investor",
  "non-us-professional",
  "retail",
]);
export const Frequency = z.enum(["realtime", "daily", "weekly", "monthly", "quarterly", "annual"]);

const Deployment = z.object({
  chain: Chain,
  token: Address,
  discovery: z
    .object({
      ignoreMethods: z.array(z.string()).default([]),
      labels: z.record(z.string(), z.string()).default({}),
    })
    .default({ ignoreMethods: [], labels: {} }),
});

const PriceReference = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("oracle"),
    provider: z.string(),
    chain: Chain,
    address: Address.optional(),
    writer: z.enum(["eoa", "issuer-multisig", "single-provider", "oracle-network"]),
    dataOrigin: z.enum(["issuer", "fund-administrator", "custodian"]),
    cadenceSeconds: z.number().int().positive(),
    historyOnchain: z.boolean(),
    source: Source,
  }),
  z.object({
    type: z.literal("none"),
    searchedAt: IsoDate,
    note: z.string().optional(),
  }),
]);

const VerificationMethod = z.object({
  type: z.enum(["attestation", "audit", "proof-of-reserve", "proof-of-asset", "self-reported"]),
  provider: z.string(),
  independent: z.boolean(),
  assetLevel: z.boolean(),
  frequency: Frequency,
  cryptographicallyVerifiable: z.boolean(),
  onchain: z.boolean(),
  feed: z.object({ chain: Chain, address: Address }).optional(),
  source: Source,
});

const InstantLiquidity = z.object({
  type: z.enum(["offramp-contract", "dex"]),
  label: z.string(),
  chain: Chain,
  address: Address,
  depthPctOfSupply: z.number().optional(),
  source: Source,
});

export const AssetSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  sample: z.boolean().default(false),
  name: z.string(),
  ticker: z.string(),
  assetClass: AssetClass,
  description: z.string(),
  issuer: z.string(),
  manager: z.string(),
  platform: z.string(),
  tokenStandard: TokenStandard,
  priceModel: PriceModel,
  deployments: z.array(Deployment).min(1),

  access: z.object({
    investorType: Sourced(InvestorType),
    minimumInvestment: Sourced(z.number()),
    transferRestricted: Sourced(z.boolean()),
  }),

  serviceProviders: z.object({
    custodian: Disclosed(z.string()),
    fundAdministrator: Disclosed(z.string()),
    auditor: Disclosed(z.string()),
    transferAgent: Disclosed(z.string()),
  }),

  legal: z.object({
    vehicleType: Disclosed(z.string()),
    jurisdiction: Disclosed(z.string()),
    lei: Disclosed(z.string()),
    secFilings: Disclosed(z.object({ cik: z.string(), forms: z.array(z.string()) })),
    offeringDocument: Disclosed(z.string()),
    auditedFinancials: Disclosed(z.string()),
    insolvency: Disclosed(z.string()),
  }),

  pricing: z.object({ reference: PriceReference }),

  verification: z.object({ methods: z.array(VerificationMethod) }),

  exit: z.object({
    redemption: z.object({
      available: Sourced(z.boolean()),
      whoCanRedeem: Sourced(z.enum(["all-holders", "whitelisted-holders", "issuer-approved"])),
      settlement: Disclosed(z.string().regex(/^T\+\d+$/)),
      minimum: Sourced(z.number()).optional(),
      gatesOrSuspension: Disclosed(z.enum(["none", "stated-limits", "issuer-discretion"])),
    }),
    instantLiquidity: z.array(InstantLiquidity).default([]),
  }),

  externalIds: z.object({
    defillama: z.string().nullable().default(null),
    rwaxyz: z.string().nullable().default(null),
    coingecko: z.string().nullable().default(null),
  }),
});

export type Asset = z.infer<typeof AssetSchema>;
export type Chain = z.infer<typeof Chain>;
export type AssetClass = z.infer<typeof AssetClass>;
export type VerificationMethod = z.infer<typeof VerificationMethod>;
export type PriceReference = z.infer<typeof PriceReference>;
