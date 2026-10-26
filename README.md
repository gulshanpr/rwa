# RWABeat

Independent, open-source risk profiles for tokenized real-world assets, rated with the RWAbeat framework: seven risk categories and Stages. See `docs/framework.md` (the framework), `docs/FRAMEWORK_SPEC.md` (exact rules), `docs/PRD.md` and `docs/TECH_SPEC.md`.

## Data pipeline

| Phase | What | Where it lives | How it updates |
|---|---|---|---|
| 0 | Curated facts, one section per risk category (holdings, providers, audits, reports, pricing, exit terms) | `data/assets/<slug>.yaml`, `data/entities/*.yaml` | By hand, from `research/<slug>.md` |
| 1 | Discovered permissions (proxies, roles, Safes, timelocks, oracle admins) | `discovered/<slug>/<chain>.json` | `bun run discover`, nightly PR via `.github/workflows/discover.yml` |
| 2 | Market measurements (top-10 holders, DEX sells of $1M / $5M / $10M) | `data/measured/<slug>.json` | `bun framework:measure` |
| 3 | Live data (supply, AUM, oracle age, DeFi markets) and alerts | Postgres | `bun run worker`, every 15 min via `.github/workflows/live.yml` |

Curated facts and discovery snapshots live in Postgres too (tables `asset`, `fact`, `entity`, `discovery_snapshot`, …), with the files above kept in sync as a Git copy. See `docs/SYSTEM_DESIGN.md`. The web app, worker and discovery CLI read Postgres when `DATABASE_URL` is set and the catalog has been imported, and fall back to the files otherwise. Live data and alerts exist only in Postgres; without a database the site shows none.

`next build` always reads the catalog from the Git copy, even when `DATABASE_URL` is set, so a deploy is reproducible from its commit and cannot fail because Postgres holds catalog data imported by another branch. Pages still use the database at runtime through ISR. Set `CATALOG_SOURCE=files` or `CATALOG_SOURCE=db` to force one source. Live data and alerts are read from Postgres during the build too.

## Commands

```bash
bun install
bun run dev                     # web app
bun run validate                # check every fact has a source and every reference resolves (runs in CI)
bun run test                    # framework rules and the expected rating of every asset
bun framework                   # print every asset's seven ratings and stage (--json for everything)
bun framework:measure           # refresh top holders and DEX sell quotes into data/measured/

bun run discover buidl          # re-read permissions from chain, write discovered/buidl/*.json
bun run discover buidl --dry-run
bun run discover --all

bun run db:local                # local Postgres (PGlite) on :5433, data in .data/
export DATABASE_URL=postgres://postgres@localhost:5433/postgres
bun run db:migrate
bun rwa import                  # load data/, discovered/, research/ into Postgres (only changes)
bun rwa export                  # write Postgres back to data/ and discovered/
bun rwa check                   # list differences between Postgres and the files
bun run worker --once           # run every job that is due, then exit
bun run worker --once oracles   # force one job
bun run worker                  # run forever on the schedule
```

Worker jobs: `watcher` (1 min), `oracles` (15 min), `supply`, `morpho`, `aave` (hourly), `aum` (6 h), `edgar` (daily), `gleif` (weekly).

PGlite serves one connection at a time, so run `next build` locally without `DATABASE_URL`. Production uses Neon.

## Adding an asset

1. Fill `research/<slug>.md` (Phase 0 template) and write `data/assets/<slug>.yaml`, including every category section (`underlying`, `counterparties`, `control`, `transparency`, `pricing`, `exit`). Every fact needs a source URL and `checkedAt`. Add `regulated`/`auditorTier` to any new provider in `data/entities/`.
2. `bun run validate`, then `bun rwa import` (on `main` this runs automatically via `.github/workflows/catalog-sync.yml`).
3. `bun run discover <slug>`. Review unclassified functions and `contract-unknown` holders; add labels under `deployments[].discovery.labels`.
4. Set `externalIds.defillamaStablecoin` if DefiLlama tracks its supply (gives AUM across all chains).
5. `bun run worker --once supply oracles aum morpho aave edgar gleif`, then `bun framework:measure <slug>`.
6. `bun framework <slug>`, add the asset's expected ratings to `lib/framework/framework.test.ts`, and check the asset page.

## Secrets (GitHub Actions)

See `.env.example`. Only `DATABASE_URL` and `SEC_USER_AGENT` are required for the live workflow; free public RPCs are the default.
