import { z } from "zod";
import { Address, Disclosed, IsoDate, Source, Sourced } from "./sourced";

export const Chain = z.enum(["ethereum", "arbitrum", "optimism", "base", "polygon", "avalanche", "bsc"]);
export const AssetClass = z.enum(["us-treasuries", "private-credit"]);
export const TokenStandard = z.enum(["ds-protocol", "erc3643", "erc4626", "oz-erc20", "custom"]);
export const PriceModel = z.enum(["stable-nav", "accumulating-nav", "market"]);
export const InvestorType = z.enum([
  "qualified-purchaser",
  "accredited-investor",
  "non-us-professional",
  "non-us-persons",
  "retail",
]);
export const Frequency = z.enum(["realtime", "daily", "weekly", "monthly", "quarterly", "annual", "unstated"]);

const Deployment = z.object({
  chain: Chain,
  token: Address,
  discovery: z
    .object({
      ignoreMethods: z.array(z.string()).default([]),
      labels: z.record(z.string(), z.string()).default({}),
      /** Centrifuge pool id. Hub and BalanceSheet are shared by every pool, so their events are filtered by it. */
      poolId: z.string().regex(/^\d+$/).optional(),
    })
    .default({ ignoreMethods: [], labels: {} }),
});

/**
 * One view call on the price contract. `args` are literal values, or `$value.<n>` for output n of the value call.
 * `index` picks one output of a multi-output function.
 */
const FeedCall = z.object({
  fn: z.string().startsWith("function "),
  args: z.array(z.string()).default([]),
  index: z.number().int().nonnegative().default(0),
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
    /** The feed only updates on business days, so weekends don't count towards its age. */
    businessDaysOnly: z.boolean().default(false),
    /** How to read a feed that isn't Chainlink-style (`latestRoundData()` + `decimals()`). */
    read: z.object({ value: FeedCall, updatedAt: FeedCall, decimals: z.number().int().nonnegative() }).optional(),
    historyOnchain: z.boolean(),
    source: Source,
  }),
  /** NAV computed by the token contract's own accounting (ERC-4626 vaults). Nothing to go stale, but someone can write it down. */
  z.object({
    type: z.literal("vault"),
    provider: z.string(),
    chain: Chain,
    address: Address,
    method: z.string(),
    writer: z.enum(["eoa", "issuer-multisig", "governance", "none"]),
    dataOrigin: z.enum(["issuer", "fund-administrator", "custodian"]),
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
  type: z.enum(["attestation", "audit", "proof-of-reserve", "self-reported"]),
  provider: z.string(),
  independent: z.boolean(),
  assetLevel: z.boolean(),
  frequency: Frequency,
  /** The report itself can be read by anyone, not only the fact that one exists. */
  publicReport: z.boolean(),
  /** Where the data is published onchain, if it is. Not scored; it tells the DeFi job which feeds carry this asset's NAV. */
  feed: z.object({ chain: Chain, address: Address }).optional(),
  source: Source,
});

/** A deployment outside the tracked `deployments`: a non-EVM chain, or an EVM chain we don't read yet. */
const OtherChain = z.object({
  chain: z.string(),
  /** native: the issuer mints there directly. lock-and-mint / burn-and-mint: a bridge mints there against tokens locked or burned elsewhere. */
  issuance: z.enum(["native", "lock-and-mint", "burn-and-mint"]),
  bridge: z.string().optional(),
  token: z.string().optional(),
  source: Source,
});

/**
 * An onchain limit on a power, e.g. a price setter that can only move the NAV a little per update.
 * It only counts when it caps the move at 2% a day or less and the holders it limits can't lift it.
 */
const Bound = z.object({
  chain: Chain,
  contract: Address,
  power: z.enum(["mint", "set-price"]),
  /** Largest move per day the bound allows, as a % of the NAV (set-price) or of supply (mint). */
  maxMovePctPerDay: z.number().positive(),
  holderCanRemove: z.boolean(),
  description: z.string(),
  source: Source,
});

const Incident = z.object({
  date: IsoDate,
  kind: z.enum(["default", "impairment", "redemption-halt", "depeg", "exploit", "key-compromise", "other"]),
  title: z.string(),
  description: z.string().optional(),
  source: Source,
});

/** Another token or fund this asset holds. `asset` is a tracked asset's slug or, for untracked funds, a name. */
const Holding = z.object({
  asset: z.string(),
  sharePct: z.number().min(0).max(100).optional(),
  source: Source,
});

/** Private-credit portfolio facts. Scored as disclosures (is it public?), never as credit quality. */
const Portfolio = z.object({
  loanLevelData: Disclosed(Frequency).optional(),
  largestExposurePct: Disclosed(z.number().min(0).max(100)).optional(),
  collateral: Disclosed(z.string()).optional(),
  lossHistory: Disclosed(z.string()).optional(),
  firstLoss: Disclosed(z.string()).optional(),
  weightedMaturityDays: Disclosed(z.number().nonnegative()).optional(),
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
    minimumInvestment: Disclosed(z.number()),
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
    /** Who regulates or registered the vehicle (e.g. BVI FSC professional fund, SEC-registered interval fund). */
    regulator: Disclosed(z.string()).optional(),
    /** What a token holder legally owns. Shown, not scored: the legal slice is not assessed. */
    claimType: Disclosed(z.enum(["fund-share", "spv-note", "issuer-note", "vault-share", "tracker-certificate", "other"])).optional(),
    /** Whether the token is the legal register of ownership, or mirrors an offchain register kept by a transfer agent. */
    register: Disclosed(z.enum(["onchain", "offchain-mirrored"])).optional(),
  }),

  pricing: z.object({
    reference: PriceReference,
    /** Who marks the loans and how bad loans are written down. Scored for private credit. */
    valuation: z
      .object({
        valuer: Disclosed(z.enum(["independent-agent", "fund-administrator", "manager"])).optional(),
        impairmentPolicy: Disclosed(z.string()).optional(),
      })
      .optional(),
  }),

  verification: z.object({
    methods: z.array(VerificationMethod),
    /** Assets the issuer or administrator says back the token, to reconcile with onchain supply × price. */
    reported: Sourced(z.object({ usd: z.number().positive(), asOf: IsoDate })).optional(),
  }),

  portfolio: Portfolio.optional(),

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

  otherChains: z.array(OtherChain).optional(),
  bounds: z.array(Bound).optional(),
  holdings: z.array(Holding).optional(),
  incidents: z.array(Incident).optional(),
  /** Things a reviewer couldn't verify. Shown on the asset page so anyone can help close them. */
  openQuestions: z.array(z.string()).optional(),

  externalIds: z.object({
    defillama: z.string().nullable().default(null),
    defillamaStablecoin: z.string().nullable().default(null),
    rwaxyz: z.string().nullable().default(null),
    coingecko: z.string().nullable().default(null),
  }),
});

export type Asset = z.infer<typeof AssetSchema>;
export type Chain = z.infer<typeof Chain>;
export type AssetClass = z.infer<typeof AssetClass>;
export type VerificationMethod = z.infer<typeof VerificationMethod>;
export type PriceReference = z.infer<typeof PriceReference>;
export type Bound = z.infer<typeof Bound>;
export type OtherChain = z.infer<typeof OtherChain>;
export type Incident = z.infer<typeof Incident>;
