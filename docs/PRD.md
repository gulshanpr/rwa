# RWABeat — Product Requirements Document

> Working name. Version 0.1 · Oct 2026 · Owner: Gulshan

## 1. One-liner

**An open-source, independent public good that shows what can go wrong with a tokenized real-world asset: who controls the token, what it depends on, and what is (and isn't) disclosed.**

L2BEAT answers "who can steal my funds on this rollup?". RWABeat answers "who can freeze, mint, upgrade, or reprice this RWA token, what backs that claim, and how do I get out?".

## 2. Problem

- Tokenized RWAs (excluding stablecoins) are ~$39B (Sep 2026) and growing fast. Chronicle's Oct 2026 report found **70.8% of sampled value ($12.27B of $17.31B) fails at least one of five data-transparency tests**.
- Existing tools answer *market* questions:
  - **rwa.xyz**: size, holders, flows, NAV, issuers. A data terminal.
  - **DefiLlama RWA**: AUM, DeFi TVL, binary flags (attestation yes/no, redeemable yes/no, KYC, self-custody).
- Nobody answers *risk* questions, publicly and for free, with every claim checkable:
  - Who holds the keys that can upgrade, mint, pause, freeze, or force-transfer the token?
  - Is that a single wallet (EOA), a multisig, or a timelock? How many signers? How long a delay?
  - Where does the onchain price/NAV come from? Is it stale? Who signs it?
  - Which DeFi markets accept it as collateral, at what LTV, priced by which oracle?
  - Is reserve data independent, asset-level, daily, verifiable, and onchain?
  - Which legal/operational documents are actually public?
  - Has any of this changed recently?

Inspiration tweet: *"Is there an RWA transparency dashboard anywhere? i.e. legal structure, what happens if the underlying company goes bust... Who's building this?"*

## 3. Goals and non-goals

### Goals (v1)
1. Publish a per-asset **risk profile** for the 20 largest tokenized Treasury and private-credit assets (the same sample as Chronicle's report, so results are comparable).
2. Make every data point **sourced**: a link, a contract call, or a transaction hash, plus the date it was checked.
3. Score five objectively checkable **risk slices** shown as a rosette.
4. Automatically **discover onchain permissions** and **alert** on changes.
5. Show **DeFi exposure**: where each token is used as collateral and how it's priced there.
6. Be **open source**, with data and methodology in a public Git repo that anyone can challenge via pull request.

### Non-goals (v1)
- Legal opinions or bankruptcy-remoteness verdicts. The legal slice is shown as **"Not assessed"** until there's a qualified contributor.
- Investment ratings (AAA–D), price predictions, or buy/sell signals.
- Market analytics already done well elsewhere: holder breakdowns, flows, volumes. Link to rwa.xyz/DefiLlama instead.
- Non-EVM chains (Solana, Stellar, Aptos, XRPL). Planned for later.
- User accounts, paywalls, or issuer-paid listings.

## 4. Users

| User | What they need | Key page |
|---|---|---|
| **Risk curators** (Steakhouse, Gauntlet, LlamaRisk, Morpho/Aave/Euler curators) | Fast due diligence and monitoring of collateral | Asset page, alerts, DeFi exposure |
| **DeFi protocols and DAOs** | Evidence for governance listing decisions | Asset page, compare view |
| **Researchers and journalists** | Citable, sourced facts | Asset page, methodology, CSV/JSON export |
| **Crypto-native investors** | "What do I actually own?" in plain English | Asset overview, "What can go wrong" |
| **Issuers** | Know how they're assessed, and correct mistakes | Methodology, GitHub corrections |

Primary user for v1: **risk curators**. If they use it, everyone else follows.

## 5. Product principles

1. **Facts over opinions.** Score only what can be checked. Mark everything else as unknown.
2. **Every number has a source.** No source, no data.
3. **Unknown is a finding.** "Offering memorandum not publicly available" is shown, not hidden.
4. **Green doesn't mean safe.** Slices describe specific risks, not overall quality.
5. **Independence.** No issuer payments for listings or scores. Issuers may submit corrections publicly.
6. **Explain like a teammate.** Every risk has a one-sentence plain-English consequence ("A single key can mint unlimited tokens").

## 6. Risk framework v1: the rosette

Six slices. Five are scored green / yellow / red. The sixth (legal) is grey "Not assessed" in v1. Exact scoring rules are in [TECH_SPEC.md §6](./TECH_SPEC.md#6-scoring-engine).

| # | Slice | Question it answers | Source of truth |
|---|---|---|---|
| 1 | **Control** | Who can upgrade, mint, pause, freeze, or force-transfer, and with what checks? | Onchain discovery |
| 2 | **Pricing** | Where does the onchain price/NAV come from, how fresh is it, and who signs it? | Oracle contracts |
| 3 | **Verification** | Is reserve data independent, asset-level, daily, verifiable, onchain? (Chronicle's five tests) | Attestation reports, oracle feeds |
| 4 | **Exit** | Can holders redeem or sell, how fast, and who is allowed? | Issuer docs, onchain liquidity |
| 5 | **Disclosure** | Are the key documents and service providers publicly named? | Issuer site, SEC EDGAR, GLEIF |
| 6 | **Legal & insolvency** | What happens to holders if the issuer fails? | *Not assessed in v1* |

### Stages (v2, after framework is stable)
- **Stage 0 — "Trust us":** any red slice.
- **Stage 1 — "Verify us":** no red in Control, Pricing, or Verification, and at least 4 of 6 disclosures public.
- **Stage 2 — "Prove it":** all scored slices green, plus the legal slice assessed and green.

## 7. Features

### 7.1 MVP (v1)

**F1. Asset risk page.** One page per asset with:
- Header: name, ticker, issuer, manager, asset class, chains, tags (e.g. "Qualified Purchasers only").
- Stat row: AUM (from DefiLlama, attributed), # admin roles, # EOAs with critical powers, oracle freshness, DeFi collateral value.
- **Rosette** with each slice's color and one-line reason.
- **"What can go wrong"**: auto-generated plain-English list of the top risks, each linked to its evidence.
- Tabs: Overview · Control · Pricing · DeFi Exposure · Verification · Exit · Disclosure · History · Sources.

**F2. Permission discovery and graph.** For each token contract: proxy type, implementation, upgrade admin, roles and their holders, multisig owners and thresholds, timelock delays. Rendered as a graph (token → role → holder → signers) and a table.

**F3. Risk screener.** Sortable/filterable table of all assets with slice dots, AUM, chains, and key flags (e.g. "EOA can upgrade", "Price stale > 24h").

**F4. DeFi exposure.** Per asset: list of lending markets where it's collateral (Morpho first, then Aave incl. Horizon, Euler), with loan asset, LLTV/LTV, oracle used, collateral supplied (USD), borrowed (USD).

**F5. Alerts feed.** Public feed of onchain changes: upgrades, admin changes, role grants/revokes, ownership transfers, pauses, multisig signer/threshold changes, large mints/burns, oracle staleness. Delivered on-site, RSS, X, and Telegram.

**F6. Methodology and learning pages.** Public framework, scoring rules, changelog, and a glossary ("What is an SPV?", "What is a timelock?"). Doubles as your own learning notes.

**F7. Open data.** Every asset's data downloadable as JSON/CSV. Public GitHub repo is the source of truth.

### 7.2 v2
- Compare view (2–4 assets side by side).
- Entity pages: issuers, custodians, fund administrators, oracle providers, multisigs ("this Safe controls $2B across 3 tokens").
- Stages.
- Multi-chain deployments per asset, with cross-chain consistency checks (does each chain's deployment have the same controls?).
- Issuer right-of-reply section on each asset page.

### 7.3 v3
- Legal & insolvency slice, with a legal contributor.
- Non-EVM chains (Solana first).
- More asset classes (tokenized stocks, commodities, real estate).
- Public API.

## 8. Initial asset list (v1)

Same sample as Chronicle's report (market caps as of June 30, 2026). EVM deployments only in v1; add other chains later.

**Tokenized Treasuries (9):** USYC, BENJI, BUIDL, USDY, EUTBL, JTRSY, WTGXX, USTB, OUSG
**Onchain credit (11):** syrupUSDC/syrupUSDT, JAAA, PRIME, STAC, FalconX, vUSD, ACRED, mF-ONE, USD3, mGLOBAL, ACRDX

Phase 0 (manual learning) starts with three: **BUIDL, USTB, syrupUSDC**, chosen because they represent three different designs: Securitize DS Protocol token, issuer-built token with an onchain NAV, and an ERC-4626 credit vault.

## 9. Success metrics

| Metric | 3 months after launch | 12 months |
|---|---|---|
| Assets covered | 20 | 60+ |
| Fields with a source link | 100% | 100% |
| Curators/protocols citing it (forum posts, docs) | 3 | 15 |
| Alerts caught before public discussion | 1 | 10 |
| External PRs (corrections, new assets) | 5 | 50 |
| Grant funding secured | 1 | 2–3 |

## 10. Roadmap

| Phase | Duration | Deliverable |
|---|---|---|
| **0. Learn** | Weeks 1–2 | Manual reviews of BUIDL, USTB, syrupUSDC, written up as markdown. Draft the framework. Read LlamaRisk, Credora, Particula, Bluechip methodologies. |
| **1. Data + discovery** | Weeks 3–5 | Monorepo, schemas, discovery CLI, scoring engine. 20 assets in YAML. |
| **2. Frontend** | Weeks 5–8 | Home, screener, asset page, methodology. Deployed. |
| **3. Alerts + DeFi exposure** | Weeks 8–10 | Watcher worker, alerts feed, Morpho + Aave exposure. |
| **4. Launch** | Week 10 | Launch write-up ("What can issuers do to your RWA tokens?"), reply to the inspiration tweet, post on curator forums, apply for grants. |
| **5. v2** | Months 3–6 | Entity pages, compare, multi-chain, Stages. |

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Wrong data damages credibility | Every field sourced; discovery output committed to Git and diffed; corrections via public PRs; changelog. |
| Issuer pushback or legal threats | Report facts with sources, never opinions on legal merit; clear disclaimer; right-of-reply. |
| Bespoke token designs break automated discovery | Per-standard handlers (OpenZeppelin, DS Protocol, ERC-3643, ERC-4626) plus manual overrides in YAML. |
| Maintenance burden as a solo dev | Small, fixed asset list; automation first; GitHub Actions for scheduled jobs; recruit contributors via grants. |
| Framework seen as biased (like Chronicle's vendor framework) | Publish rules openly; don't partner commercially with any data or oracle vendor; acknowledge where Chronicle's tests are used and credit them. |

## 12. Business model

None. It's a public good. Funding via grants and donations: Ethereum Foundation, Optimism RetroPGF, Arbitrum, Gitcoin, and potentially DAOs that benefit (Sky/Grove, Aave, Morpho). **No issuer money, ever.**

## 13. Legal disclaimer (site-wide)

> RWABeat provides information for educational purposes only. It is not investment, legal, tax, or financial advice, and it is not a credit rating. Data may be incomplete or wrong; always verify with the linked primary sources. Risk slices describe specific, checkable properties and do not indicate overall safety.

## 14. Open questions

1. Final name and domain (check trademark conflicts with L2BEAT).
2. Should AUM come from DefiLlama (free API, attribution) or be computed from `totalSupply × price` ourselves? Proposed: compute ourselves, cross-check with DefiLlama.
3. Thresholds for "large mint" alerts (proposed: > 5% of supply or > $10M).
4. Whether to include stablecoins later (Bluechip already covers them).
