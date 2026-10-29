# RWABeat

Independent, open-source risk profiles for tokenized real-world assets. Every fact is sourced, and every asset is rated across seven risk categories plus a Stage.

## Quick start

```bash
bun install
bun run dev
```

The site runs from the files in `data/` and `discovered/`. Set `DATABASE_URL` to add live data and alerts; see `.env.example`.

## Layout

| Path | What |
| --- | --- |
| `app/`, `components/` | Next.js site |
| `lib/framework/` | Rating rules |
| `data/assets/`, `data/entities/` | Curated, sourced facts (YAML) |
| `discovered/` | On-chain permissions, written by `discovery/` |
| `data/measured/` | Top holders and DEX sell quotes |
| `worker/` | Jobs that write live data and alerts to Postgres |
| `db/` | Drizzle schema and migrations |

## Commands

```bash
bun run validate          # every fact sourced, every reference resolves
bun run test              # framework rules and expected ratings
bun run format            # prettier
bun framework [slug]      # print ratings and stage
bun framework:measure     # refresh data/measured/
bun run discover <slug>   # re-read permissions from chain (--all, --dry-run)
bun run worker [--once]   # live-data jobs
bun run db:local          # local Postgres (PGlite) on :5433
bun run db:migrate
bun rwa import|export|check   # sync files <-> Postgres
```

Worker jobs: `watcher` (1 min), `oracles` (15 min), `supply`, `morpho`, `aave` (hourly), `aum` (6 h), `edgar` (daily), `gleif` (weekly).

`next build` reads the catalog from the files even when `DATABASE_URL` is set, so a deploy is reproducible from its commit (override with `CATALOG_SOURCE=db`). PGlite serves one connection at a time, so build locally without `DATABASE_URL`.

## Adding an asset

1. Write `data/assets/<slug>.yaml` with every category section. Each fact needs a source URL and `checkedAt`.
2. `bun run validate`, then `bun run discover <slug>`, and label any unclassified functions.
3. `bun framework:measure <slug>` and `bun framework <slug>`.
4. Add the expected ratings to `lib/framework/framework.test.ts`.

## Docs

- [framework.md](docs/framework.md) is the framework, and [FRAMEWORK_SPEC.md](docs/FRAMEWORK_SPEC.md) gives its exact rules.
- [SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) covers the data pipeline and how Postgres and the files stay in sync.
- [PRD.md](docs/PRD.md) and [TECH_SPEC.md](docs/TECH_SPEC.md) hold the product and technical specs.
