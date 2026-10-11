# RWABeat

Independent, open-source risk profiles for tokenized real-world assets. See `docs/PRD.md` and `docs/TECH_SPEC.md`.

## Data pipeline

| Phase | What | Where it lives | How it updates |
|---|---|---|---|
| 0 | Curated facts (issuer, custodian, legal, pricing, exit) | `data/assets/<slug>.yaml`, `data/entities/*.yaml` | By hand, from `research/<slug>.md` |
| 1 | Discovered permissions (proxies, roles, Safes, timelocks, oracle admins) | `discovered/<slug>/<chain>.json` | `bun run discover`, nightly PR via `.github/workflows/discover.yml` |
| 3 | Live data (supply, AUM, oracle age, DeFi markets) and alerts | Postgres | `bun run worker`, every 15 min via `.github/workflows/live.yml` |

The web app reads Postgres when `DATABASE_URL` is set and falls back to `data/live/*.json` otherwise.

## Commands

```bash
bun install
bun run dev                     # web app
bun run validate                # check every fact has a source and every reference resolves (runs in CI)

bun run discover buidl          # re-read permissions from chain, write discovered/buidl/*.json
bun run discover buidl --dry-run
bun run discover --all

bun run db:local                # local Postgres (PGlite) on :5433, data in .data/
export DATABASE_URL=postgres://postgres@localhost:5433/postgres
bun run db:migrate
bun run worker --once           # run every job that is due, then exit
bun run worker --once oracles   # force one job
bun run worker                  # run forever on the schedule
```

Worker jobs: `watcher` (1 min), `oracles` (15 min), `supply`, `morpho`, `aave` (hourly), `aum` (6 h), `edgar` (daily), `gleif` (weekly).

PGlite serves one connection at a time, so run `next build` locally without `DATABASE_URL`. Production uses Neon.

## Adding an asset

1. Fill `research/<slug>.md` (Phase 0 template) and write `data/assets/<slug>.yaml`. Every fact needs a source URL and `checkedAt`.
2. `bun run validate`.
3. `bun run discover <slug>`. Review unclassified functions and `contract-unknown` holders; add labels under `deployments[].discovery.labels`.
4. Set `externalIds.defillamaStablecoin` if DefiLlama tracks its supply (gives AUM across all chains).
5. `bun run worker --once supply oracles aum morpho aave edgar gleif` and check the asset page.

## Secrets (GitHub Actions)

See `.env.example`. Only `DATABASE_URL` and `SEC_USER_AGENT` are required for the live workflow; free public RPCs are the default.
