# RWAbeat framework: implementation spec

How [framework.md](./framework.md) is turned into ratings. The rules are in `lib/framework/`; the site, the CSV/JSON API and `bun framework` all use them.

## Data

| Path | What | Written by |
|---|---|---|
| `data/assets/<slug>.yaml` | The asset profile: identity and deployments, then one section per category (`underlying`, `counterparties`, `control`, `transparency`, `pricing`, `exit`) plus `legal` facts and the `freshnessClass` | Hand, with a source on every fact; synced with Postgres (`bun rwa import`/`export`) |
| `data/entities/<slug>.yaml` | Providers. Custodians and administrators carry `regulated`/`regulator`, auditors `auditorTier` | Hand, synced with Postgres |
| `discovered/<slug>/<chain>.json` | Privileged powers and who holds them, for Control | `bun discover` |
| Postgres (`assets_snapshot`, `oracle_reading`, `defi_market`) | Supply, oracle reading, lending markets | Live jobs. The tests use a frozen copy in `lib/framework/fixtures/live/<slug>.json` |
| `data/measured/<slug>.json` | Top-10 holder share (Blockscout) and DEX sells of $1M / $5M / $10M into USDC (KyberSwap), against NAV | `bun framework:measure` |

Schemas: `lib/schema/asset.ts`, `lib/schema/entity.ts`, `lib/schema/measured.ts`. `bun run validate` parses every file, checks that entity references resolve (issuer, providers, report providers) and warns on sources older than 90 days.

Commands: `bun framework` prints the matrix and headlines (`--json` for everything); `bun framework:measure [slug]` refreshes market data.

## States

Each category is green, yellow, red, **unverified**, or **not assessed** (Legal Claim, for now).

Every check is green, yellow, red or unknown. A known red makes the category red. Otherwise, if an unknown check could turn out worse than what is known, the category is unverified, and the worst known color is kept as its floor ("unverified, at least yellow"). An unknown that can't change the result is ignored.

## Categories

Thresholds are constants at the top of each file.

**Underlying Asset** (`underlying.ts`)
- Green: at least 95% cash, T-bills, government repo, government money funds or stablecoins, and short-dated (WAM ≤ 365 days). A fund holding only bills, repo and cash counts as short-dated without a published WAM.
- Credit is yellow at best. Red if: the largest borrower is over 20% of the pool or there are fewer than 10 borrowers; the book is mostly unsecured and below investment grade; history is under 12 months; or holders took a loss in the last 3 years.

**Counterparties** (`counterparties.ts`)
- Red: custodian or administrator not disclosed, or in the issuer's group; no audit disclosed.
- Yellow: an unregulated custodian or administrator; an auditor outside the Big Four, PCAOB registration and the major networks; one firm as both custodian and administrator; a single settlement rail; any curated dependency.

**Control** (`control.ts`; who holds each power comes from `permissions.ts`)
- Red: a single key (EOA, unknown contract, or 1-of-n Safe) holds a critical power or `freeze`, even behind a timelock; no published audit; unverified contract source.
- Yellow: a single key that can only pause or change compliance; a critical power held by a weak multisig or with no timelock; a Safe module; admin powers not documented by the issuer; latest audit over 24 months old; any bridged deployment.
- Green also needs multisig signers shown to be independent.

**Transparency** (`transparency.ts`). The best public report counts.
- Freshness bars: T-bills and money funds daily; short-duration credit weekly; private credit monthly, plus a commitment to report defaults as they happen; real estate quarterly.
- Red: self-reported only, or no reports. Green: data from a third party (administrator, custodian or independent firm), every position, fresh for the asset, and at least attested.
- The onchain badge is separate: yes if any report is published onchain.

**Pricing** (`pricing.ts`)
- Red: no NAV feed (a stable token is then assumed to be $1); a single key writes the price or can write a vault's NAV down; updates slower than the asset's freshness bar; a stale feed (over 3× its cadence); consumers can't tell when the price is stale.
- Yellow: issuer-sourced NAV; issuer multisig publishes the price; write-downs reach the price late; the token trades but its discount to NAV isn't tracked, or has exceeded 2%; a lending market hardcodes $1.

**Exit** (`exit.ts`)
- Red: suspension at the issuer's discretion; settlement over T+5; monthly or quarterly dealing; notice over 7 days; any lock-up; liquidators can't hold the token; no redemption and no market.
- Yellow: allowlisted-only redemption; T+2 to T+5; weekly dealing; a daily cap; allowlisted liquidators only; no instant path that can take $5M.
- "Real" liquidity means a $5M DEX sell within 1% of NAV, or an instant facility that can pay $5M today. A route losing over 10% at $1M is dust, not a market.

**Stages** (`stages.ts`). The checklist from framework.md. Stage = the highest stage whose requirements, and all lower ones, are met; below Stage 0 shows as "none". Bankruptcy remoteness (Stage 1) and an independent trustee (Stage 2) are legal checks and stay "not assessed", so for now an asset can reach Stage 0 at most. `pendingLegal` marks assets held back only by those.

## Calls made where framework.md is open

1. "No secondary market" is red only when there is also no redemption. Otherwise every allowlisted T-bill fund would be red, which contradicts the Asset A example.
2. A hard-coded price is red for the token's own feed. A lending market hardcoding $1 is yellow, because it is the market's choice.
3. Liquidators have three states: anyone (green), allowlisted (yellow), none (red).
4. "Redemption longer than a week" means more than five business days.
5. A 1-of-n Safe counts as a single key.
6. Freshness classes: JAAA and syrupUSDC are short-duration credit; ACRED, mF-ONE and FalconX are private credit.
