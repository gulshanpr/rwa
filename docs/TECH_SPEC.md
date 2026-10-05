# RWABeat — Technical Specification

> Version 0.1 · Oct 2026 · Companion to [PRD.md](./PRD.md) and [DESIGN.md](./DESIGN.md)

## 1. Architecture overview

Two kinds of data, handled differently:

| Kind | Examples | Where it lives | How it changes |
|---|---|---|---|
| **Curated** (human-reviewed) | Issuer, custodian, documents, redemption terms, attestation links | YAML files in Git | Pull requests |
| **Discovered** (machine-read) | Proxy admins, roles, Safe signers, timelock delays | JSON snapshots in Git | Discovery CLI, committed so diffs are reviewable |
| **Live** (time series) | Prices, oracle freshness, DeFi exposure, events | Postgres | Scheduled jobs and watcher |

```
                ┌──────────────────────── GitHub repo (source of truth) ────────────────────────┐
                │  data/assets/*.yaml   data/entities/*.yaml   discovered/<asset>/<chain>.json   │
                └───────────────▲──────────────────────────────┬─────────────────────────────────┘
                                │ PR (CLI output)              │ read at build time
                 ┌──────────────┴─────────┐          ┌─────────▼──────────┐
 RPC / Etherscan │ packages/discovery     │          │ packages/scoring   │
 ───────────────►│ (CLI, runs nightly in  │          │ (pure functions)   │
                 │  GitHub Actions)       │          └─────────┬──────────┘
                 └────────────────────────┘                    │
                                                     ┌─────────▼──────────┐       ┌──────────────┐
 RPC / Morpho / Aave / DefiLlama / SEC / GLEIF ─────►│ apps/worker        │──────►│  Postgres    │
                                                     │ (cron jobs +       │       │  (Neon)      │
                                                     │  event watcher)    │       └──────┬───────┘
                                                     └─────────┬──────────┘              │
                                                               │ alerts                  │
                                                     X / Telegram / RSS        ┌─────────▼──────────┐
                                                                               │ apps/web (Next.js) │
                                                                               │ ISR, Vercel        │
                                                                               └────────────────────┘
```

**Why this split:** the risk assessment (curated + discovered) is fully reproducible from Git, just like L2BEAT. Postgres only holds things that change constantly.

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language; `viem` is TS-first |
| Monorepo | pnpm workspaces + Turborepo | Simple, fast |
| Chain access | `viem` | Typed contract reads, multicall, log decoding |
| Schemas | `zod` | Validates YAML and API responses; types generated from schemas |
| Web | Next.js (App Router) + React Server Components | ISR for fast static pages with fresh data |
| UI | Tailwind CSS + shadcn/ui (Radix) | Professional look, accessible primitives |
| Tables | TanStack Table | Sorting, filtering, column visibility |
| Charts | Apache ECharts (`echarts-for-react`) | Stacked areas with zoom slider, like rwa.xyz |
| Permission graph | React Flow (`@xyflow/react`) | Node graph of token → role → holder → signers |
| Database | Postgres (Neon free tier) + Drizzle ORM | Typed queries, easy migrations |
| Worker hosting | Railway or Fly.io (small instance) | Long-running watcher |
| Scheduled jobs | GitHub Actions cron (discovery) + worker cron (live data) | Free, logs are public |
| Web hosting | Vercel | Free tier, ISR |
| Testing | Vitest; Anvil fork tests for discovery | Deterministic chain reads |

## 3. Repository structure

```
rwabeat/
├── apps/
│   ├── web/                       # Next.js frontend
│   │   ├── app/
│   │   │   ├── (site)/page.tsx                 # Home
│   │   │   ├── screener/page.tsx
│   │   │   ├── alerts/page.tsx
│   │   │   ├── asset-classes/[class]/page.tsx  # treasuries, private-credit
│   │   │   ├── assets/[slug]/
│   │   │   │   ├── page.tsx                    # Overview tab
│   │   │   │   ├── control/page.tsx
│   │   │   │   ├── pricing/page.tsx
│   │   │   │   ├── defi/page.tsx
│   │   │   │   ├── verification/page.tsx
│   │   │   │   ├── exit/page.tsx
│   │   │   │   ├── disclosure/page.tsx
│   │   │   │   ├── history/page.tsx
│   │   │   │   └── sources/page.tsx
│   │   │   ├── entities/[slug]/page.tsx        # v2
│   │   │   ├── methodology/[[...slug]]/page.tsx  # MDX
│   │   │   ├── learn/[[...slug]]/page.tsx        # MDX glossary
│   │   │   └── api/                            # JSON/CSV export, RSS
│   │   ├── components/
│   │   │   ├── layout/        # Sidebar, Topbar, Breadcrumb, CommandSearch
│   │   │   ├── risk/          # Rosette, SliceBadge, RiskList, StageBadge
│   │   │   ├── data/          # StatCard, DataTable, KeyFactsCard, SourceLink
│   │   │   ├── charts/        # AreaChart, DonutChart, Sparkline
│   │   │   └── permissions/   # PermissionGraph, RoleTable, AddressChip
│   │   └── content/           # methodology + learn MDX
│   └── worker/                # Live data jobs + event watcher + alert publisher
│       ├── src/jobs/          # prices, oracles, morpho, aave, defillama, edgar, gleif
│       ├── src/watcher/       # log subscriptions, decoders, alert rules
│       └── src/publishers/    # x, telegram, rss
├── packages/
│   ├── schema/                # zod schemas + inferred types
│   ├── config/                # loads + validates YAML, exposes typed `assets`, `entities`
│   ├── discovery/             # CLI: contract discovery + handlers
│   ├── scoring/               # pure scoring functions + "what can go wrong" text generation
│   ├── db/                    # Drizzle schema + migrations
│   └── shared/                # chain registry, address utils, formatting
├── data/
│   ├── assets/                # one YAML per asset (buidl.yaml, ustb.yaml, ...)
│   ├── entities/              # issuers, managers, custodians, administrators, oracles, auditors
│   └── chains.yaml
├── discovered/
│   └── buidl/
│       ├── ethereum.json      # committed discovery output
│       └── ethereum.meta.json # block number, timestamp, tool version
├── research/                  # Phase 0 manual reviews (markdown)
├── .github/workflows/
│   ├── ci.yml                 # lint, typecheck, test, validate YAML
│   ├── discover.yml           # nightly discovery → opens PR if diff
│   └── deploy.yml
└── docs/                      # PRD, TECH_SPEC, DESIGN
```

## 4. Data model

### 4.1 Sourced values

Every curated fact is wrapped so a source is mandatory:

```ts
// packages/schema/src/sourced.ts
export const Source = z.object({
  url: z.string().url().optional(),       // document, webpage, explorer link
  tx: z.string().optional(),              // tx hash when evidence is onchain
  note: z.string().optional(),            // e.g. "Section 4.2, page 17"
  checkedAt: z.string().date(),           // when a human last confirmed it
}).refine(s => s.url || s.tx, "A source needs a url or tx");

export const Sourced = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, source: Source });

// Unknown is explicit, not a missing field
export const Disclosed = <T extends z.ZodTypeAny>(value: T) =>
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("public"), value, source: Source }),
    z.object({ status: z.literal("not_public"), searchedAt: z.string().date(), note: z.string().optional() }),
    z.object({ status: z.literal("unknown") }),
  ]);
```

### 4.2 Asset YAML (curated)

```yaml
# data/assets/buidl.yaml
slug: buidl
name: BlackRock USD Institutional Digital Liquidity Fund
ticker: BUIDL
assetClass: us-treasuries          # us-treasuries | private-credit | ...
description: >
  Tokenized money market fund investing in cash, US Treasury bills and repo.
issuer: blackrock-buidl-fund-ltd   # → data/entities/
manager: blackrock
platform: securitize
tokenStandard: ds-protocol         # ds-protocol | erc3643 | erc4626 | oz-erc20 | custom
priceModel: stable-nav             # stable-nav ($1, rebasing/dividends) | accumulating-nav | market

deployments:
  - chain: ethereum
    token: "0x7712c34205737192402172409a8F7ccef8aA2AEc"
    discovery:
      ignoreMethods: []            # skip noisy view functions
      overrides: {}                # manual role labels if auto-discovery can't infer

access:
  investorType: { value: qualified-purchaser, source: { url: "...", checkedAt: 2026-10-05 } }
  minimumInvestment: { value: 5000000, source: { url: "...", checkedAt: 2026-10-05 } }
  transferRestricted: { value: true, source: { url: "...", checkedAt: 2026-10-05 } }

serviceProviders:
  custodian:        { status: public, value: bny, source: { url: "...", checkedAt: 2026-10-05 } }
  fundAdministrator:{ status: public, value: securitize-fund-services, source: { url: "...", checkedAt: 2026-10-05 } }
  auditor:          { status: public, value: pwc, source: { url: "...", checkedAt: 2026-10-05 } }
  transferAgent:    { status: public, value: securitize, source: { url: "...", checkedAt: 2026-10-05 } }

legal:
  vehicleType:   { status: public, value: "BVI business company (fund)", source: { url: "...", checkedAt: 2026-10-05 } }
  jurisdiction:  { status: public, value: VG, source: { url: "...", checkedAt: 2026-10-05 } }
  lei:           { status: public, value: "529900P1LBVZISCTYK24", source: { url: "https://search.gleif.org/...", checkedAt: 2026-10-05 } }
  secFilings:    { status: public, value: { cik: "0002013810", forms: [D] }, source: { url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0002013810", checkedAt: 2026-10-05 } }
  offeringDocument: { status: not_public, searchedAt: 2026-10-05, note: "Available to investors only" }
  auditedFinancials: { status: not_public, searchedAt: 2026-10-05 }
  insolvency:    { status: unknown }   # legal slice not assessed in v1

verification:
  methods:
    - type: proof-of-asset        # attestation | audit | proof-of-reserve | proof-of-asset | self-reported
      provider: chronicle
      independent: true
      assetLevel: true
      frequency: daily            # realtime | daily | weekly | monthly | quarterly | annual
      cryptographicallyVerifiable: true
      onchain: true
      feed: { chain: ethereum, address: "0x..." }
      source: { url: "https://chroniclelabs.org/dashboard/proof-of-asset", checkedAt: 2026-10-05 }

exit:
  redemption:
    available: { value: true, source: { url: "...", checkedAt: 2026-10-05 } }
    whoCanRedeem: { value: whitelisted-holders, source: { url: "...", checkedAt: 2026-10-05 } }
    settlement: { value: "T+0", source: { url: "...", checkedAt: 2026-10-05 } }
    gatesOrSuspension: { status: unknown }
  instantLiquidity:
    - type: offramp-contract      # e.g. USDC redemption facility
      address: "0x..."
      chain: ethereum
      source: { url: "...", checkedAt: 2026-10-05 }

externalIds:
  defillama: "..."
  rwaxyz: BUIDL
  coingecko: null
```

### 4.3 Entity YAML

```yaml
# data/entities/bny.yaml
slug: bny
name: BNY Mellon
type: [custodian]
jurisdiction: US
lei: "..."
website: https://www.bny.com
```

### 4.4 Discovered JSON (machine output)

```jsonc
// discovered/buidl/ethereum.json
{
  "asset": "buidl",
  "chain": "ethereum",
  "block": 23500000,
  "timestamp": "2026-10-05T00:00:00Z",
  "contracts": {
    "0x7712...": {
      "name": "DSToken",
      "role": "token",
      "proxy": { "type": "eip1967", "implementation": "0x...", "admin": "0x..." },
      "verified": true,
      "permissions": [
        { "power": "upgrade",        "holder": "0xAAA...", "via": "eip1967.admin" },
        { "power": "mint",           "holder": "0xBBB...", "via": "DSToken.issueTokens / role ISSUER" },
        { "power": "force-transfer", "holder": "0xBBB...", "via": "DSToken.seize / role TRANSFER_AGENT" },
        { "power": "pause",          "holder": "0xCCC...", "via": "DSToken.pause / role MASTER" }
      ]
    }
  },
  "holders": {
    "0xAAA...": { "kind": "safe", "threshold": 3, "owners": ["0x...", "0x...", "0x...", "0x...", "0x..."], "modules": [] },
    "0xBBB...": { "kind": "eoa" },
    "0xCCC...": { "kind": "timelock", "minDelaySeconds": 172800, "proposers": ["0xAAA..."], "executors": ["0x0000...0000"] }
  }
}
```

### 4.5 Canonical power types

Scoring works on normalized powers, not contract-specific function names:

| Power | Meaning | Criticality |
|---|---|---|
| `upgrade` | Change contract logic | Critical |
| `mint` | Create new tokens | Critical |
| `force-transfer` / `seize` | Move tokens out of a holder's wallet | Critical |
| `burn-from` | Destroy tokens in a holder's wallet | Critical |
| `set-price` | Write the NAV/price used onchain | Critical |
| `freeze` / `blacklist` | Block a specific address | High |
| `pause` | Stop all transfers | High |
| `set-compliance` | Change allowlist / compliance rules | High |
| `admin` | Grant/revoke other roles | Inherits highest of the roles it controls |

### 4.6 Postgres tables (live data)

```ts
// packages/db/src/schema.ts (Drizzle)
assets_snapshot   (asset_slug, chain, ts, total_supply, price_usd, aum_usd, source)
oracle_reading    (feed_id, ts, value, updated_at_onchain, age_seconds, round_id)
defi_market       (market_id, protocol, chain, collateral_asset, loan_asset, lltv, oracle_address,
                   collateral_usd, borrow_usd, supply_usd, ts)
chain_event       (id, asset_slug, chain, block, tx_hash, log_index, contract, event_name, args_json, ts)
alert             (id, asset_slug, severity, kind, title, body_md, event_id, published_at, channels_json)
external_check    (asset_slug, source, key, value_json, ts)   // EDGAR, GLEIF, DefiLlama cross-checks
```

## 5. Data sources

### 5.1 Source matrix

| Data | Source | Method | Cost | Frequency |
|---|---|---|---|---|
| Contract source, ABI, verification | **Etherscan API V2** `api.etherscan.io/v2/api?chainid=<id>&module=contract&action=getsourcecode` | REST, one key for all EVM chains | Free (5 req/s, shared) | On discovery |
| Proxy implementation/admin | **RPC** `eth_getStorageAt` on EIP-1967 slots | `viem.getStorageAt` | Free tier RPC | Nightly + on event |
| Role holders | **RPC** `eth_getLogs` for `RoleGranted`/`RoleRevoked` etc., replayed into current state | `viem.getLogs` (paginate block ranges) or **Envio HyperSync** for fast history | Free tiers | Nightly + live |
| Safe owners/threshold/modules | **RPC** `getOwners()`, `getThreshold()`, `getModulesPaginated()` | Contract reads | Free | Nightly + on event |
| Timelock delay/roles | **RPC** `getMinDelay()`, role logs | Contract reads | Free | Nightly |
| Token supply | **RPC** `totalSupply()` | Multicall | Free | Hourly |
| Oracle values/freshness | **RPC** Chainlink `latestRoundData()`, Chronicle `readWithAge()`, RedStone, Pyth, or the issuer's own NAV contract | Per-adapter reads | Free | Every 15 min |
| Morpho collateral exposure | **Morpho API** `POST https://api.morpho.org/graphql` (`markets` with `collateralAsset`, `oracle`, `lltv`, `state`) | GraphQL | Free | Hourly |
| Aave exposure (incl. Horizon RWA market) | Aave V3 **`AaveProtocolDataProvider` / `UiPoolDataProvider`** onchain reads, or Aave's official API | Contract reads / API | Free | Hourly |
| Euler, Pendle, Kamino (v2) | Their public APIs or subgraphs | REST/GraphQL | Free | Hourly |
| AUM cross-check, attestation links seed | **DefiLlama free API** `https://api.llama.fi/rwa/current`, `/rwa/list` | REST, no key | Free | Daily |
| Prices cross-check | DefiLlama `coins.llama.fi/prices/current/{chain}:{address}` | REST | Free | Hourly |
| SEC filings (Form D, N-CSR, etc.) | **SEC EDGAR** `https://data.sec.gov/submissions/CIK##########.json` (needs a `User-Agent` header with contact email) | REST | Free | Daily |
| Legal entity data | **GLEIF API** `https://api.gleif.org/api/v1/lei-records/{lei}` | REST | Free | Weekly |
| Chronicle Proof of Asset status | Chronicle dashboard (manual) + onchain feed reads | Manual + RPC | Free | Weekly (manual) |
| Issuer docs, redemption terms, providers | Issuer websites, fact sheets, prospectus where public | **Manual**, recorded in YAML | — | Monthly review |
| Market reference (link only) | rwa.xyz asset pages | Link out (their API is paid enterprise) | — | — |

**RPC providers:** start with Alchemy or Infura free tiers per chain; add a fallback with `viem`'s `fallback()` transport (e.g. public RPCs, dRPC). Keep keys in GitHub Actions secrets and worker env.

### 5.2 Rate limits and caching
- Wrap every external client with a token-bucket limiter (`p-limit` + delay). Etherscan's 5 req/s is shared across chains.
- Cache Etherscan source/ABI responses in `.cache/etherscan/<chainId>/<address>.json`. They rarely change; invalidate when an `Upgraded` event fires.
- Store a `lastProcessedBlock` per (chain, contract) so log scans are incremental.

## 6. Scoring engine

`packages/scoring` exports pure functions: `scoreAsset(curated, discovered, live) → AssetScore`. No I/O. Fully unit-tested.

```ts
type SliceColor = "green" | "yellow" | "red" | "grey";
interface SliceResult {
  slice: "control" | "pricing" | "verification" | "exit" | "disclosure" | "legal";
  color: SliceColor;
  headline: string;          // "A single EOA can mint tokens"
  reasons: Reason[];         // each links to evidence (contract, tx, url)
}
```

### 6.1 Control

Evaluate every **critical** and **high** power across all deployments. Take the worst holder.

Holder classification:
- `eoa`: a single key.
- `safe(m/n)`: multisig. "Strong" if `m ≥ 3` and `m/n ≥ 0.5`. Otherwise "weak".
- `timelock(d)`: wraps another holder; inherits its proposer's class, plus delay `d`.
- `contract-unknown`: an unverified or unrecognized contract → treated as `eoa` (worst case) until labeled.
- `immutable`: power does not exist (no proxy, renounced).

| Color | Rule |
|---|---|
| **Red** | Any critical power held by an `eoa` or `contract-unknown`, **or** any critical power held by a weak Safe with no timelock. |
| **Yellow** | Critical powers held by strong Safes **without** timelock, **or** upgrade delay < 7 days, **or** high powers held by an EOA. |
| **Green** | `upgrade` is immutable or behind a timelock ≥ 7 days controlled by a strong Safe, **and** `mint`/`force-transfer`/`set-price` are held by strong Safes or timelocked, **and** no high powers held by EOAs. |

Note shown on the page: *For regulated securities, freeze and force-transfer powers are often legally required. This slice scores who holds them and what checks exist, not whether they exist.*

### 6.2 Pricing

Applies to the price source used by the issuer and the main DeFi integrations.

| Color | Rule |
|---|---|
| **Red** | Price written by an EOA, **or** no onchain price/NAV reference, **or** last update older than 3× the expected cadence. |
| **Yellow** | Price written by an issuer-controlled multisig or a single provider relaying issuer-reported NAV; updates on schedule. |
| **Green** | Independent oracle network, data sourced from a fund administrator or custodian (not the issuer), updates at least daily, history onchain. |

For `stable-nav` tokens (fixed $1), score the NAV verification feed if there is one; if DeFi markets hardcode $1, show a **yellow** flag "DeFi markets assume $1 with no onchain NAV check".

### 6.3 Verification (Chronicle's five tests)

For the best verification method, count how many are true: `independent`, `assetLevel`, `frequency ≤ daily`, `cryptographicallyVerifiable`, `onchain`.

| Color | Rule |
|---|---|
| **Green** | 5 of 5 |
| **Yellow** | 3–4 of 5 |
| **Red** | 0–2 of 5, or self-reported only |

Credit: *"Five tests adapted from Chronicle Labs, 'The Transparency Gap in Onchain Finance' (Oct 2026)."*

### 6.4 Exit

| Color | Rule |
|---|---|
| **Green** | Documented redemption at T+1 or faster for all eligible holders, **and** an onchain instant-liquidity path (redemption contract or DEX liquidity ≥ 2% of supply at ≤ 1% slippage). |
| **Yellow** | Documented redemption at T+5 or faster, but no instant path; or instant path exists but documentation is incomplete. |
| **Red** | No documented redemption, redemption > T+5, or redemption can be suspended at issuer discretion with no stated limits. |

### 6.5 Disclosure

Six checks, each `public` / `not_public` / `unknown`: **legal entity + jurisdiction**, **custodian named**, **fund administrator named**, **auditor named**, **offering document public**, **audited financials public**.

| Color | Rule |
|---|---|
| **Green** | ≥ 5 public |
| **Yellow** | 3–4 public |
| **Red** | ≤ 2 public |

`unknown` counts as not public, and the page shows "We couldn't find this. Can you? Open a PR."

### 6.6 Legal & insolvency
Always `grey` in v1: *"Not assessed. We don't yet evaluate bankruptcy remoteness or holder claims. See what is disclosed in the Disclosure tab."*

### 6.7 "What can go wrong" generator
Map each red/yellow reason to a template:

```ts
const templates = {
  "control.eoa.mint":   (r) => `A single key (${short(r.holder)}) can create unlimited new ${r.ticker} tokens, diluting holders.`,
  "control.eoa.upgrade":(r) => `A single key can replace the token's code at any time, with no delay.`,
  "pricing.stale":      (r) => `The onchain price hasn't updated in ${humanize(r.age)}; lending markets may misprice it.`,
  "exit.no-instant":    ()  => `There's no onchain way to exit instantly; redemption goes through the issuer.`,
  // ...
};
```

Sort by severity (red first, then critical power first). Show top 5 on the overview.

## 7. Discovery engine

### 7.1 CLI

```bash
pnpm discover buidl                 # all deployments of one asset
pnpm discover buidl --chain ethereum
pnpm discover --all                 # nightly job
pnpm discover buidl --dry-run       # print diff without writing
```

### 7.2 Algorithm (inspired by L2BEAT's discovery)

1. **Start** from the token address in the asset YAML.
2. **Fetch metadata:** Etherscan source + ABI. Mark `verified: false` if unverified (counts against Control).
3. **Detect proxy:** read EIP-1967 slots:
   - implementation `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`
   - admin `0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103`
   - beacon `0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50`

   Also check EIP-1822 (UUPS `proxiableUUID`), OpenZeppelin `ProxyAdmin.owner()`, and Safe/Diamond (EIP-2535 `facets()`) patterns. Use the implementation ABI for subsequent reads.
4. **Run handlers** matched by `tokenStandard` and by ABI shape (see 7.3). Each handler returns `permissions[]` and new addresses to explore.
5. **Classify holders:** `getCode` empty → EOA. Has `getOwners`+`getThreshold` → Safe. Has `getMinDelay` → OZ Timelock. Otherwise → recurse (up to depth 4) or mark `contract-unknown`.
6. **Recurse** into ProxyAdmins, Timelocks, compliance/registry contracts, and NAV oracles referenced by the token.
7. **Write** `discovered/<asset>/<chain>.json` with sorted keys (stable diffs) and `meta.json` (block, timestamp, tool version).

### 7.3 Handlers

| Handler | Detects | Reads |
|---|---|---|
| `oz-ownable` | `owner()` | Owner address → power `admin` for `onlyOwner` functions (mapped via ABI function names) |
| `oz-access-control` | `hasRole`, `getRoleAdmin` | Replay `RoleGranted(bytes32,address,address)` / `RoleRevoked(...)` logs → current members per role. Role names from `keccak256("MINTER_ROLE")` etc. via a known-roles dictionary |
| `oz-pausable` | `paused()` | Who can call `pause` |
| `ds-protocol` (Securitize) | `getDSService(uint256)` | Resolve Trust/Registry/Compliance services; read `TrustService` role assignments (master, issuer, exchange, transfer agent) |
| `erc3643` (T-REX) | `identityRegistry()`, `compliance()` | Agents (`AgentAdded`/`AgentRemoved` logs) → `freeze`, `force-transfer`, `mint`; owner of token, registry, compliance |
| `erc4626-vault` (e.g. syrupUSDC) | `asset()`, `convertToAssets` | Underlying asset, vault manager/admin roles, withdrawal queue/delays |
| `safe` | `getOwners`, `getThreshold` | Owners, threshold, modules (modules can bypass signers → flag), guard |
| `oz-timelock` | `getMinDelay` | Delay, proposer/executor/canceller roles |
| `chainlink-feed` | `latestRoundData`, `aggregator()` | Aggregator, owner, decimals |
| `chronicle-oracle` | `readWithAge()` | Toll/kiss whitelist, authorized feeds |
| `custom/<issuer>` | Manual | For bespoke tokens (e.g. Superstate, Ondo): small, explicit handler files mapping function → power |

Unknown privileged functions: any non-view function with an `only*` modifier or role check in verified source that no handler mapped is listed as **"Unclassified privileged function"** for manual review, so nothing is silently ignored.

### 7.4 Nightly workflow

`.github/workflows/discover.yml`:
1. Run `pnpm discover --all`.
2. If any `discovered/**` file changed, open a PR titled `discovery: <asset> changes at block <n>` with a human-readable diff summary (e.g. "Safe 0xAAA threshold 3/5 → 2/5").
3. A human reviews and merges. Merging triggers a site rebuild.

## 8. Live data worker

### 8.1 Jobs (`apps/worker/src/jobs`)

| Job | Schedule | Writes |
|---|---|---|
| `supply` | hourly | `assets_snapshot` |
| `prices` | hourly | `assets_snapshot.price_usd` (issuer NAV contract → DefiLlama fallback) |
| `oracles` | every 15 min | `oracle_reading`; emits staleness alerts |
| `morpho` | hourly | `defi_market` (query markets filtered by our token addresses as `collateralAsset`) |
| `aave` | hourly | `defi_market` |
| `defillama-crosscheck` | daily | `external_check`; flags AUM mismatch > 5% for review |
| `edgar` | daily | `external_check`; alert on new filings for tracked CIKs |
| `gleif` | weekly | `external_check`; alert on LEI status change (e.g. lapsed) |

Example Morpho query:

```graphql
query RwaCollateral($addresses: [String!]!, $chains: [Int!]!) {
  markets(first: 100, where: { collateralAssetAddress_in: $addresses, chainId_in: $chains }) {
    items {
      marketId
      lltv
      oracle { address }
      loanAsset { address symbol }
      collateralAsset { address symbol }
      state { collateralAssetsUsd borrowAssetsUsd supplyAssetsUsd utilization }
    }
  }
}
```

(Confirm filter field names in the Morpho API playground; the schema evolves.)

### 8.2 Event watcher (`apps/worker/src/watcher`)

- Subscribe with `viem.watchEvent` over WebSocket per chain, with a polling fallback every 60s using `lastProcessedBlock`.
- Contracts watched: every address in `discovered/**` (tokens, proxies, ProxyAdmins, Safes, Timelocks, oracles).
- Wait for N confirmations before alerting (Ethereum 12, L2s 30) to avoid reorg noise.

| Event | Alert severity |
|---|---|
| `Upgraded(address)`, `BeaconUpgraded`, `AdminChanged` | Critical |
| `OwnershipTransferred` on token/ProxyAdmin | Critical |
| `RoleGranted`/`RoleRevoked` for critical powers | Critical |
| Safe `AddedOwner`, `RemovedOwner`, `ChangedThreshold`, `EnabledModule` | High |
| Timelock `CallScheduled` touching a tracked contract | High (gives advance warning) |
| `Paused` / `Unpaused` | High |
| Freeze/blacklist/seize events (handler-specific) | Medium |
| Mint/burn > 5% of supply or > $10M | Medium |
| Oracle stale > 3× cadence, or price deviation > 2% from cross-check | High |

Every alert also triggers a re-run of discovery for that asset, so the risk page updates.

### 8.3 Publishers
- **On-site feed** `/alerts` and per-asset History tab (from `alert` table).
- **RSS** `/api/alerts.rss`.
- **Telegram** bot channel (Bot API `sendMessage`).
- **X** (manual approval queue at first, to avoid posting false positives).

## 9. Web app

### 9.1 Rendering
- Asset, class, and methodology pages: **static generation with ISR** (`revalidate: 3600`); curated + discovered data is bundled at build time from Git.
- Live widgets (oracle age, DeFi exposure, alerts): server components that read Postgres with `revalidate: 300`.
- Screener: server-rendered initial table + client-side TanStack filtering. 20–100 rows, so no pagination needed.

### 9.2 Public JSON/CSV (v1 read-only)
- `GET /api/assets` — list with slice colors and key metrics
- `GET /api/assets/[slug]` — full profile (curated + discovered + scores)
- `GET /api/assets/[slug].csv`
- `GET /api/alerts?asset=&severity=&since=`

Cache with `Cache-Control: s-maxage=300`.

## 10. Quality and testing

- **Schema validation in CI:** every YAML must parse with zod; every `public` field must have a source.
- **Scoring unit tests:** fixtures for each rule (EOA mint → red, 3/5 Safe + 7d timelock → green, etc.).
- **Discovery fork tests:** run handlers against an Anvil fork at a pinned block; snapshot the output.
- **Link checker:** weekly job flags dead source URLs.
- **Staleness check:** CI warns when any curated field's `checkedAt` is older than 90 days.

## 11. Security and ops

- No user data and no auth in v1. Smaller attack surface.
- RPC/API keys only in GitHub Actions secrets and worker env; never shipped to the browser.
- Worker health: `/healthz` endpoint plus an uptime monitor (e.g. Better Stack free). Alert yourself on Telegram if the watcher lags > 100 blocks.

## 12. Build order (maps to PRD roadmap)

1. **Week 1–2 (Phase 0):** write `research/buidl.md`, `research/ustb.md`, `research/syrupusdc.md` by hand, using Etherscan "Read as Proxy", Safe UI, and issuer sites. Note every privileged function you find. This becomes your handler checklist.
2. **Week 3:** monorepo scaffold, `schema`, `config`, 3 asset YAMLs, CI validation.
3. **Week 4:** discovery core (proxy detection, holder classification) + `oz-*`, `safe`, `oz-timelock` handlers. Snapshot BUIDL, USTB, syrupUSDC.
4. **Week 5:** `ds-protocol`, `erc4626-vault`, `erc3643` handlers; scoring engine with tests; expand to 20 assets.
5. **Weeks 5–8:** web app (layout, home, screener, asset page tabs, methodology MDX).
6. **Weeks 8–10:** worker (supply, oracles, Morpho, Aave), watcher, alerts, publishers.
7. **Week 10:** launch.
