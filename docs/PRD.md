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

