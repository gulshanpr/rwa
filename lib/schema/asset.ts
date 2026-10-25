import { z } from "zod";
import { Address, Disclosed, IsoDate, Source, Sourced } from "./sourced";

// One curated profile per asset, shaped by the RWAbeat framework (docs/framework.md): identity and
// deployments, then the facts each risk category is rated on. Every fact carries a source.

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
/** Sets the bar for "fresh enough" in Transparency and Pricing (framework §5, freshness table). */
export const FreshnessClass = z.enum(["tbill-mmf", "short-duration-credit", "private-credit", "real-estate"]);

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

// Underlying Asset

export const HoldingType = z.enum([
  "cash",
  "government-bills",
  "government-notes",
  "government-repo",
  "government-mmf",
  "stablecoin",
  "secured-loans",
  "unsecured-loans",
  "structured-credit",
  "corporate-bonds",
  "credit-fund",
  "digital-asset-strategies",
  "real-estate",
  "other",
]);

const Holding = z.object({
  type: HoldingType,
  pct: z.number().min(0).max(100),
  label: z.string().optional(),
});

const Loss = z.object({
  date: IsoDate,
  what: z.string(),
  lossPct: z.number().optional(),
  source: Source,
});

const Underlying = z.object({
  /** `mandate`: only the investment mandate is public, not a dated holdings report. */
  holdings: Disclosed(z.object({ asOf: IsoDate, basis: z.enum(["report", "mandate"]).default("report"), items: z.array(Holding).min(1) })),
  /** Weighted average maturity in days. For floating-rate credit, the weighted average life. */
  wamDays: Disclosed(z.number().nonnegative()),
  // Credit only: left out for government funds.
  creditQuality: Disclosed(z.enum(["investment-grade", "high-yield", "unrated"])).optional(),
  /** Share of the credit book that is senior and secured by collateral. */
  securedPct: Disclosed(z.number().min(0).max(100)).optional(),
  /** Largest single private borrower or issuer, as % of the pool. */
  largestObligorPct: Disclosed(z.number().min(0).max(100)).optional(),
  obligors: Disclosed(z.number().int().nonnegative()).optional(),
  /** Performance history: when it starts and every loss passed on to holders. */
  trackRecord: Sourced(z.object({ since: IsoDate, losses: z.array(Loss).default([]) })),
});

// Counterparties

export const Role = z.enum(["custodian", "fund-administrator", "auditor", "transfer-agent"]);
export const Rail = z.enum(["usd-wire", "usdc", "usdt", "pyusd", "usds", "other-stablecoin", "in-kind"]);

const Counterparties = z.object({
  // Entity slugs (data/entities).
  custodian: Disclosed(z.string()),
  fundAdministrator: Disclosed(z.string()),
  auditor: Disclosed(z.string()),
  transferAgent: Disclosed(z.string()),
  /** Roles filled by the issuer, the manager or a company in the same group. */
  affiliated: Sourced(z.array(Role)),
  /** How subscription and redemption money moves. One rail is a single point of failure. */
  settlementRails: Sourced(z.array(Rail).min(1)),
  /** Other offchain companies holders depend on: servicers, underwriters, prime brokers, master funds. */
  operators: z.array(z.object({ role: z.string(), name: z.string(), source: Source })).default([]),
  /** A single company whose failure would stop the product, beyond the ones already counted. */
  dependencies: z.array(z.object({ name: z.string(), what: z.string(), source: Source })).default([]),
});

// Control (the powers themselves come from discovery)

const Control = z.object({
  audits: z.array(z.object({ auditor: z.string(), scope: z.string(), date: IsoDate, source: Source })),
  bugBounty: Disclosed(z.object({ platform: z.string(), maxUsd: z.number() })),
  /** The issuer publishes which admin powers exist and what they are for. */
  powersDocumented: Sourced(z.boolean()),
  /** Multisig signers are named, or shown to be independent people or firms. */
  signersIndependent: Disclosed(z.boolean()),
  /** Every chain the token lives on. Anything but `native` means holders there depend on a bridge. */
  chains: z.array(
    z.object({
      chain: z.string(),
      mechanism: z.enum(["native", "native+bridge", "bridged"]),
      provider: z.string().optional(),
      source: Source,
    }),
  ),
});

// Transparency

export const DataSource = z.enum(["issuer", "fund-administrator", "custodian", "independent"]);
export const Granularity = z.enum(["nav", "asset-class", "position"]);
export const Verifiability = z.enum(["self-reported", "attestation", "audit", "cryptographic"]);

const Report = z.object({
  name: z.string(),
  /** Entity slug. */
  provider: z.string(),
  dataSource: DataSource,
  granularity: Granularity,
  frequency: Frequency,
  verifiability: Verifiability,
  onchain: z.boolean(),
  /** Onchain feed that carries the report, if any. Lending-market oracles reading it count as NAV-priced. */
  feed: z.object({ chain: Chain, address: Address }).optional(),
  source: Source,
});

const Transparency = z.object({
  /** Public reports only. Investor-only material goes in `constraints`. */
  reports: z.array(Report),
  /** Defaults, restructurings and write-downs are reported when they happen, not at the next periodic report. */
  eventReporting: Disclosed(z.boolean()),
  /** Data kept private for a legal or privacy reason. Shown as context, never as a penalty. */
  constraints: z.array(z.object({ what: z.string(), reason: z.string(), sharedWith: z.string(), source: Source })).default([]),
});

// Pricing

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

const Pricing = z.object({
  reference: PriceReference,
  /** A consumer can tell from the feed how old the price is: a real `updatedAt`, or a revert past a maximum age. */
  stalenessDetectable: Sourced(z.boolean()),
  /** How a write-down reaches the onchain price: at once, at the next NAV strike, or later than that. */
  lossRecognition: Sourced(z.enum(["immediate", "next-nav", "delayed"])),
  /** Largest discount of the secondary-market price to NAV. Only asked when the token trades. */
  secondaryDiscount: Disclosed(z.object({ maxPct: z.number(), window: z.string() })).optional(),
});

// Exit

const InstantFacility = z.object({
  label: z.string(),
  chain: Chain.optional(),
  address: Address.optional(),
  /** Documented limit per day. */
  dailyCapUsd: Disclosed(z.number()),
  /** What the facility could pay out when checked. */
  fundedUsd: Disclosed(z.number()),
  feeBps: z.number().optional(),
});

const Exit = z.object({
  redemption: z.object({
    available: Sourced(z.boolean()),
    whoCanRedeem: Sourced(z.enum(["all-holders", "whitelisted-holders", "issuer-approved"])),
    settlement: Disclosed(z.string().regex(/^T\+\d+$/)),
    gatesOrSuspension: Disclosed(z.enum(["none", "stated-limits", "issuer-discretion"])),
  }),
  dealing: Sourced(z.enum(["continuous", "daily", "weekly", "monthly", "quarterly"])),
  noticeDays: Disclosed(z.number().int().nonnegative()),
  lockupDays: Disclosed(z.number().int().nonnegative()),
  /** Cap on primary redemptions per day. A public `null` means no cap. */
  dailyCapUsd: Disclosed(z.number().nullable()),
  minimumUsd: Disclosed(z.number()),
  feeBps: Disclosed(z.number()),
  /** Can a lending market's liquidator legally take and hold the token? */
  liquidators: Sourced(z.enum(["anyone", "allowlisted", "none"])),
  instant: z.array(InstantFacility).default([]),
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

  /** Facts for the Legal Claim category, which isn't rated yet. LEI and SEC filings also feed the GLEIF and EDGAR jobs. */
  legal: z.object({
    vehicleType: Disclosed(z.string()),
    jurisdiction: Disclosed(z.string()),
    lei: Disclosed(z.string()),
    secFilings: Disclosed(z.object({ cik: z.string(), forms: z.array(z.string()) })),
    offeringDocument: Disclosed(z.string()),
    auditedFinancials: Disclosed(z.string()),
    insolvency: Disclosed(z.string()),
  }),

  freshnessClass: Sourced(FreshnessClass),
  underlying: Underlying,
  counterparties: Counterparties,
  control: Control,
  transparency: Transparency,
  pricing: Pricing,
  exit: Exit,

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
export type Frequency = z.infer<typeof Frequency>;
export type FreshnessClass = z.infer<typeof FreshnessClass>;
export type HoldingType = z.infer<typeof HoldingType>;
export type Role = z.infer<typeof Role>;
export type Rail = z.infer<typeof Rail>;
export type Report = z.infer<typeof Report>;
export type PriceReference = z.infer<typeof PriceReference>;
