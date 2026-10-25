import { z } from "zod";
import { Chain, Frequency } from "../schema/asset";
import { Address, Disclosed, IsoDate, Source, Sourced } from "../schema/sourced";

// Data for the RWAbeat framework (docs/framework.md). It sits next to the curated asset profile in
// data/assets and adds only what the new categories need. Every fact has a source, like the asset files.

/** Sets the bar for "fresh enough" in Transparency and Pricing (framework §5, freshness table). */
export const AssetProfile = z.enum(["tbill-mmf", "short-duration-credit", "private-credit", "real-estate"]);

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

export const Role = z.enum(["custodian", "fund-administrator", "auditor", "transfer-agent"]);
export const Rail = z.enum(["usd-wire", "usdc", "usdt", "pyusd", "usds", "other-stablecoin", "in-kind"]);

const Counterparties = z.object({
  // Entity slugs. Kept here, not read from data/assets, so this framework's facts stand on their own.
  custodian: Disclosed(z.string()),
  fundAdministrator: Disclosed(z.string()),
  auditor: Disclosed(z.string()),
  /** Roles filled by the issuer, the manager or a company in the same group. */
  affiliated: Sourced(z.array(Role)),
  /** How subscription and redemption money moves. One rail is a single point of failure. */
  settlementRails: Sourced(z.array(Rail).min(1)),
  /** Other offchain companies holders depend on: servicers, underwriters, prime brokers, master funds. */
  operators: z.array(z.object({ role: z.string(), name: z.string(), source: Source })).default([]),
  /** A single company whose failure would stop the product, beyond the ones already counted. */
  dependencies: z.array(z.object({ name: z.string(), what: z.string(), source: Source })).default([]),
});

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

export const DataSource = z.enum(["issuer", "fund-administrator", "custodian", "independent"]);
export const Granularity = z.enum(["nav", "asset-class", "position"]);
export const Verifiability = z.enum(["self-reported", "attestation", "audit", "cryptographic"]);

const Report = z.object({
  name: z.string(),
  provider: z.string(),
  dataSource: DataSource,
  granularity: Granularity,
  frequency: Frequency,
  verifiability: Verifiability,
  onchain: z.boolean(),
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

const Pricing = z.object({
  /** A consumer can tell from the feed how old the price is: a real `updatedAt`, or a revert past a maximum age. */
  stalenessDetectable: Sourced(z.boolean()),
  /** How a write-down reaches the onchain price: at once, at the next NAV strike, or later than that. */
  lossRecognition: Sourced(z.enum(["immediate", "next-nav", "delayed"])),
  /** Largest discount of the secondary-market price to NAV. Only asked when the token trades. */
  secondaryDiscount: Disclosed(z.object({ maxPct: z.number(), window: z.string() })).optional(),
});

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

export const FrameworkSchema = z.object({
  asset: z.string(),
  profile: Sourced(AssetProfile),
  underlying: Underlying,
  counterparties: Counterparties,
  control: Control,
  transparency: Transparency,
  pricing: Pricing,
  exit: Exit,
});

export const EntityFactsSchema = z.object({
  entities: z.array(
    z.object({
      slug: z.string(),
      /** For entities that have no file in data/entities. */
      name: z.string().optional(),
      /** Supervised as a bank, trust company, broker-dealer, adviser or licensed fund service provider. */
      regulated: Sourced(z.boolean()).optional(),
      regulator: z.string().optional(),
      /** `global-network`: a member firm of a top-ten international audit network, approved by its local regulator. */
      auditorTier: Sourced(z.enum(["big-four", "pcaob-registered", "global-network", "other"])).optional(),
    }),
  ),
});

/** Written by `bun framework:measure`. */
export const MeasuredSchema = z.object({
  asset: z.string(),
  asOf: z.iso.datetime(),
  holders: z
    .object({
      chain: Chain,
      count: z.number().int().optional(),
      top10Pct: z.number(),
      top: z.array(z.object({ address: Address, name: z.string().optional(), isContract: z.boolean(), pct: z.number() })),
      source: z.url(),
    })
    .optional(),
  dex: z.object({
    chain: Chain,
    navUsd: z.number(),
    quotes: z.array(
      z.object({
        sizeUsd: z.number(),
        routed: z.boolean(),
        outUsd: z.number().optional(),
        /** Shortfall against NAV, in percent. */
        slippagePct: z.number().optional(),
      }),
    ),
    source: z.url(),
  }),
});

export type Framework = z.infer<typeof FrameworkSchema>;
export type EntityFacts = z.infer<typeof EntityFactsSchema>["entities"][number];
export type Measured = z.infer<typeof MeasuredSchema>;
export type HoldingType = z.infer<typeof HoldingType>;
export type Role = z.infer<typeof Role>;
export type Rail = z.infer<typeof Rail>;
export type AssetProfile = z.infer<typeof AssetProfile>;
export type Report = z.infer<typeof Report>;
