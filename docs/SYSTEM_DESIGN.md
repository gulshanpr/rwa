# RWABeat — Data platform design

> Version 0.1 · Oct 2026 · Supersedes the storage parts of [TECH_SPEC.md](./TECH_SPEC.md) §1, §3, §4 and §7.4

## 1. Why this exists

Adding syrupUSDC took about a dozen new or asset-specific files. Some of that is fine (an asset has to be described somewhere), but much of it was **code**, and code per asset does not scale to 20 assets, let alone 100.

| What was added for syrupUSDC | Kind | Problem |
|---|---|---|
| `data/assets/syrupusdc.yaml`, 3 entity YAMLs | Curated data | A file per asset; hand-edited YAML; no form, no gap report |
| `discovered/syrupusdc/*.json`, `data/live/syrupusdc.json` | Generated data | Files that only exist because there was no database for them |
| `research/syrupusdc.md` | Notes | Free text; findings had to be copied into YAML by hand |
| `discovery/handlers/maple.ts` (262 lines) | **Code** | Which contracts to walk, which functions give which power, written by hand |
| `discover.ts` `platform === "maple"` branch | **Code** | Dispatch per platform |
| ~25 Maple events in `worker/watcher.ts` | **Code** | Alert rules hardcoded |
| `HAND_SCORES` in `scoring.test.ts` | **Code** | Per-asset expected scores in a test file |
| Schema enums, `allocate` power, vault pricing | Framework | Legitimate, one-time. Not a problem |

The goal: **adding an asset on a platform we already know (syrupUSDT, another Securitize fund) needs no code and no new files.** You enter data; the system does the rest. Adding a new platform needs one new *template* (data), and code only when it needs a reading primitive we have never needed before.

## 2. Three layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│ FRAMEWORK (code, changes rarely, versioned in the changelog)            │
│  zod schemas · power types · scoring rules · discovery primitives ·     │
│  template interpreter · worker jobs · UI                                │
├─────────────────────────────────────────────────────────────────────────┤
│ TEMPLATES (data in Postgres, one per platform or token standard)        │
│  oz-standard · ds-protocol · maple-v2 · erc3643 · chainlink-feed · …    │
│  how to walk contracts, read roles, map functions → powers, alert rules │
├─────────────────────────────────────────────────────────────────────────┤
│ ASSETS (data in Postgres, one record per asset)                         │
│  curated facts with sources · deployments · template + parameters ·     │
│  discovery snapshots · live data · alerts · research notes · hand scores│
└─────────────────────────────────────────────────────────────────────────┘
```

syrupUSDC and syrupUSDT are two asset records pointing at the same `maple-v2` template. BUIDL and every other Securitize fund point at `ds-protocol`.

## 3. Postgres is the store for everything

The current split (curated YAML and discovered JSON in Git, live data in Postgres) moves to **one database**. The live tables (`assets_snapshot`, `oracle_reading`, `defi_market`, `chain_event`, `alert`, `external_check`, `cursor`) stay as they are. New tables:

```ts
entity            (slug PK, name, types text[], jurisdiction, lei, website, created_at, updated_at)

asset             (slug PK, name, ticker, asset_class, description,
                   issuer → entity, manager → entity, platform → entity,
                   token_standard, price_model, template_id → template,
                   status: draft | published | archived,
                   external_ids jsonb, created_at, updated_at)

deployment        (asset_slug, chain, token, labels jsonb, ignore_methods text[],
                   template_params jsonb)                       PK (asset_slug, chain)

fact              (id, asset_slug, path,                        -- e.g. "legal.lei", "exit.redemption.settlement"
                   status: public | not_public | unknown,
                   value jsonb, source_url, source_tx, source_note,
                   checked_at, searched_at, note,
                   entered_by, created_at, superseded_at)       -- append-only; current row has superseded_at null

template          (id, version, name, spec jsonb, created_at)   PK (id, version)

discovery_snapshot(id, asset_slug, chain, block, ts, tool_version, template_id, template_version,
                   contracts jsonb, holders jsonb, extra jsonb, warnings jsonb,
                   diff_summary text[], status: pending | approved | rejected,
                   reviewed_by, reviewed_at)

hand_score        (asset_slug, slice, color, reason, top_risks text[], by, ts)
research_note     (id, asset_slug, section, body_md, by, ts)
suggestion        (id, asset_slug, path, proposed jsonb, source_url, contact, status, ts)
```

### 3.1 Why facts are rows, not one JSON document per asset

Each field that today is a `Sourced`/`Disclosed` value in YAML becomes one `fact` row keyed by its path, with the field stored as-is in `body` and `status`, `source_url` and `checked_at` copied out for querying. That gives:

- **History for free.** A correction inserts a new row and sets `superseded_at` on the old one. "What did we say about syrupUSDC's LEI on 1 Oct?" is a query.
- **One generic form.** The admin form is generated from `AssetSchema`: every path is a field with value, status, source URL and checked date. No per-asset UI.
- **Gap and staleness reports across all assets.** "Every fact with `checked_at` older than 90 days" or "every asset where `serviceProviders.auditor` is unknown" is one SQL query (TECH_SPEC §10 asked for this).
- **The same validation.** Loading an asset assembles current facts into the existing `AssetSchema` shape and parses it with zod. Scoring and pages don't change.

Arrays whose items carry their own sources (`verification.methods`, `exit.instantLiquidity`) are a single fact whose value is the array.

### 3.2 What happens to the Git files

Decision (13 Oct 2026): **Postgres is where data is edited, and the YAML/JSON in Git is kept in sync as a second copy.** The files stay reviewable in pull requests, CI validates them without a database, and the site falls back to them when no database is configured.

| Files | Role |
|---|---|
| `data/assets/*.yaml`, `data/entities/*.yaml` | Second copy. `bun rwa export` writes them from Postgres in the hand-written style; `bun rwa import` loads edits made in Git |
| `discovered/**` | Second copy of the latest approved `discovery_snapshot` per asset and chain. The discovery CLI writes both |
| `data/live/*.json` | Kept for now as the fallback when there is no database. To be removed once the deployed site always has one |

Sync rules:

- `bun rwa import` only writes what changed: one new `fact` row per changed field, nothing for unchanged ones. Running it twice is a no-op.
- `bun rwa export` produces files that re-import with zero changes (checked by `bun rwa check`).
- `.github/workflows/catalog-sync.yml` runs `import` on every push to `main` that touches the files (merged discovery PRs, hand edits).
- After an edit in `/admin` (step 4), the admin action runs the export and opens a pull request, so Git never silently drifts.
- If both sides changed the same field, the last import or export wins. `bun rwa check` lists every difference before you run either.
| `research/*.md` | `research_note` rows. Free text stays free text, but it is attached to the asset and shown in admin |
| `HAND_SCORES` in tests | `hand_score` rows. `bun rwa check` compares engine output with hand scores for every asset |
| Unit tests on scoring rules | Stay in code. They test the framework, not assets |

### 3.3 Keeping the trust properties the PRD promised

The PRD's mitigation for "wrong data damages credibility" was: every field sourced, discovery diffed in Git, corrections by public PR. The database version keeps each property:

| Property | In Git today | In the database |
|---|---|---|
| Every field sourced | zod refine | Same zod refine, plus a `CHECK` that public facts have `source_url` or `source_tx` |
| Reviewable diffs of discovery | Nightly PR | `discovery_snapshot.status = pending` with `diff_summary`; approve or reject in `/admin/review`. Only approved snapshots are scored |
| Public history | `git log` | Append-only `fact` rows; public `/assets/[slug]/sources` shows the change history |
| Reproducible from public data | Clone the repo | Still true: the Git copy is kept in sync |
| Outside corrections | Pull requests | Still pull requests against the Git copy (imported on merge), plus a "Suggest a correction" form that writes a `suggestion` row |

## 4. Templates: discovery and alerts as data

A template replaces a handler file. It is a JSON document, validated by a zod schema, interpreted by one generic function `runTemplate(ctx, template, deployment)`. The interpreter only knows a small set of **primitives**. Every handler written so far reduces to these:

| Primitive | What it does | Used by |
|---|---|---|
| `call` | Read a getter on a known contract and bind the result to a name | Maple `manager()`, `globals()`, `poolDelegate()`; DS `getDSService(id)` |
| `list` | Read `length()` + `item(i)` and bind an array | Maple `strategyListLength` / `strategyList(i)` |
| `logSet` | Replay an event, collect addresses, keep those a check call confirms | OZ `RoleGranted`+`hasRole`; Maple `RoleUpdated`+`hasRole`, `ValidInstanceSet`+`isInstanceOf`, `PermissionAdminSet`+`permissionAdmins`; DS role events + `getRole` |
| `proxy` | Detect EIP-1967 / UUPS / beacon, or a custom `implementation()` getter | Every template |
| `contract` | Add a contract: name, role, optional `matchFunction` to pick a variant, and its **rules** | Every template |
| `rule` | `power` + function names (or a modifier) + holder names + a plain-English `via` note | Every template |
| `modifierMap` | Modifier name → holder names, for sources whose guards are modifiers | `ds-protocol`, `oz-standard` |
| `holder` | Force-classify an address (e.g. a custom timelock: delay from a call, proposers from a `logSet`) | Maple `GovernorTimelock` |
| `notScored`, `exemptModifiers` | Privileged functions reviewed and deliberately not scored | Every template |
| `events` | Alert rules: event name → severity, kind, title template (`{arg}`), consequence | Every template |
| `amountEvents` | Mint/burn events and the field holding the amount | `ds-protocol`, ERC-4626 |

The existing safety net stays: any privileged function in verified source that no rule maps and that is not in `notScored` is a **warning** on the snapshot, and the snapshot can't be approved while warnings are open (or each one is acknowledged with a note).

### 4.1 Example: part of `maple-v2`

```jsonc
{
  "id": "maple-v2",
  "version": 3,
  "appliesTo": { "tokenStandard": "erc4626", "requires": ["manager()"] },
  "bind": [
    { "call": "manager()", "on": "token", "as": "pm" },
    { "call": "globals()", "on": "pm", "as": "globals" },
    { "call": "governor()", "on": "globals", "as": "governor" },
    { "call": "securityAdmin()", "on": "globals", "as": "securityAdmin" },
    { "call": "operationalAdmin()", "on": "globals", "as": "operationalAdmin" },
    { "call": "poolDelegate()", "on": "pm", "as": "poolDelegate" },
    { "list": ["strategyListLength()", "strategyList(uint256)"], "on": "pm", "as": "strategies" },
    { "logSet": "event ValidInstanceSet(bytes32 indexed instanceKey_, address indexed instance_, bool isValid_)",
      "on": "globals", "where": { "instanceKey_": "bytes32:STRATEGY_MANAGER" },
      "pick": "instance_", "confirm": "isInstanceOf(bytes32,address)", "as": "strategyManagers" }
  ],
  "holders": [
    { "address": "governor", "kind": "timelock",
      "delay": { "call": "defaultTimelockParameters()", "on": "governor", "field": 0 },
      "proposers": { "logSet": "event RoleUpdated(bytes32 indexed role, address indexed account, bool grantRole)",
                     "where": { "role": "keccak:PROPOSER_ROLE" }, "pick": "account",
                     "confirm": "hasRole(address,bytes32)" } }
  ],
  "contracts": [
    { "at": "strategies[]", "matchFunction": "fund", "name": "LoanManager", "role": "service",
      "rules": [
        { "power": "upgrade", "fns": ["upgrade"], "holders": ["securityAdmin"],
          "via": "securityAdmin, no delay, to any version the governor registered" },
        { "power": "allocate", "fns": ["fund", "callPrincipal"], "holders": ["poolDelegate"],
          "via": "pool delegate (only to borrowers the governor or operationalAdmin approved)" },
        { "power": "set-price", "fns": ["impairLoan", "removeLoanImpairment"], "holders": ["poolDelegate", "governor"],
          "via": "pool delegate or governor (marks a loan's value down or back up in the NAV)" }
      ] }
  ],
  "notScored": ["setDelegateManagementFeeRate", "withdrawCover", "processRedemptions"],
  "exemptModifiers": ["^only(Pool|PoolManager|Self|IfNotConfigured|Factory)$"],
  "events": {
    "UnrealizedLossesUpdated": { "severity": "high", "kind": "nav-drop",
      "title": "{contract}: unrealized losses set to {unrealizedLosses_}", "consequence": "@NAV_DOWN" },
    "PoolPermissionLevelSet": { "severity": "high", "kind": "compliance-change",
      "title": "{contract}: permission level set to {permissionLevel}",
      "consequence": "Who can deposit, redeem and transfer the token changed. Level 0 (private) blocks everyone not on the allowlist." }
  },
  "amountEvents": { "Deposit": { "kind": "mint", "field": "shares_" }, "Withdraw": { "kind": "burn", "field": "shares_" } }
}
```

Standard events (EIP-1967 `Upgraded`, Safe owner changes, OZ roles, `Paused`) live in a built-in `base` template that every template extends, so they are written once.

### 4.2 Escape hatch

Some protocol will eventually need logic no primitive covers. Then a template may reference a **named primitive** (`{ "custom": "ds-role-bitmask" }`) implemented once in `discovery/primitives/`. The rule is: a primitive is generic enough to be reused, never named after an asset. If a template needs more than two custom primitives, that is a signal to add a general one.

### 4.3 Choosing a template

`asset.template_id` is set explicitly when the asset is created. The admin form suggests one by probing the token: `getDSService` → `ds-protocol`; `identityRegistry` → `erc3643`; `asset` + `manager` + `globals` → `maple-v2`; `hasRole`/`owner` → `oz-standard`. The `platform === "maple"` branch in `discover.ts` goes away.

## 5. Workflows

### 5.1 Add an asset on a known platform (the common case)

1. **Create** in `/admin/assets/new` (or `bun rwa asset new syrupusdt`): name, ticker, class, issuer/manager/platform (pick existing entities or create them inline), token address per chain. The template is suggested.
2. **Discover**: the system runs the template and stores a `pending` snapshot. Warnings (unmapped functions) show up for review.
3. **Fill facts**: the generated form lists every path in `AssetSchema`. Each field takes value, status (public / not public / unknown) and a source. Research notes sit next to the form.
4. **Gap report**: before publishing, the page shows which facts are unknown, which are missing sources, and what the engine would score. You can record a hand score to compare against.
5. **Publish**: `status = published`. The worker and watcher pick it up on their next run because they iterate `asset` rows. Pages refresh through cache tags.

No code, no files. This is the acceptance test for the migration: **add syrupUSDT this way.**

### 5.2 Add a new platform

1. Create a template in `/admin/templates` starting from the closest one (e.g. copy `oz-standard`).
2. Run discovery in dry-run against one asset. The warnings list every privileged function not yet mapped.
3. Add rules, `notScored` entries or alert events until warnings are zero, then save as a new template version.
4. Continue with 5.1.

### 5.3 Ongoing changes

- **Nightly discovery** writes a new `pending` snapshot only when content differs, with a human diff ("Safe 0xAAA threshold 3/5 → 2/5"). You approve it in `/admin/review`. Alerts keep flowing from the watcher regardless.
- **Correcting a fact** inserts a new `fact` row. The old one is kept.
- **Template changes** create a new version. Snapshots record which version produced them, so a rule change is explainable.
- **Framework changes** (a new power, a new scoring rule) stay code changes with a changelog entry, as today.

## 6. How the code changes

| Area | Change |
|---|---|
| `lib/catalog.ts` (done) | `getCatalog()` returns assets, entities and latest approved snapshots from Postgres, or from the files when there is no database, the tables are empty, or the query fails. `lib/data.ts` stays as the file reader. Pages use the existing ISR (`revalidate = 300`), so a database edit shows within 5 minutes |
| `lib/live-store.ts` | Drop the JSON fallback once the deployed site always has a database |
| Admin actions (step 4) | Server Actions that write rows, then refresh the affected pages. Instant refresh needs either `revalidatePath` or moving to `'use cache'` + `cacheTag("asset:<slug>")` + `updateTag`, which requires `cacheComponents: true` |
| `discovery/` | Keep `context.ts`, `rpc.ts`, `sources.ts`, `powers.ts`. Add `template.ts` (zod schema for templates) and `interpret.ts`. `handlers/*.ts` become templates and are deleted once their output matches |
| `discovery/cli.ts` | Writes snapshots to the database instead of files (`--file` keeps the old behaviour for debugging) |
| `worker/watcher.ts` | `RULES` and `AMOUNT_EVENTS` come from the asset's template (merged with `base`) |
| `scripts/validate.ts` | Becomes `bun rwa check`: parse every published asset, list gaps and stale facts, compare engine scores with `hand_score` |
| Auth for `/admin` | One admin account. Simplest option: GitHub OAuth restricted to your user. `proxy.ts` blocks `/admin/**` otherwise |

The scoring engine, the schemas and every public page stay as they are. They already take an `Asset`, `Discovered[]` and `Live`; only where those come from changes.

## 7. Migration plan

Each step leaves the site working.

1. **Tables and import (done 13 Oct 2026).** Tables `entity`, `asset`, `deployment`, `fact`, `discovery_snapshot`, `research_note`, `hand_score` (migration `0001_catalog`). `bun rwa import | export | check`. The site, worker and discovery CLI read through `getCatalog()`. Checked: files → database → files round-trips with zero changes, and BUIDL and syrupUSDC profiles (asset, snapshots, powers, scores) are identical from either source. `template` and `suggestion` tables come with steps 2 and 5.
2. **Template interpreter.** Write `interpret.ts` and port `oz-standard`, `ds-protocol` and `maple-v2` to templates. Check (golden test): running each template at the pinned blocks (BUIDL 26,168,531; syrupUSDC 26,176,587) produces the same contracts, permissions and holders as the committed snapshots. Then delete `handlers/`.
3. **Watcher from templates.** Move the event rules out of `watcher.ts`. Check: replaying the same block range raises the same alerts.
4. **Admin UI.** Asset form generated from `AssetSchema`, template editor (JSON with validation and dry-run), review queue, gap report.
5. **Export and suggestions.** `/api/export`, optional public data repo, "suggest a correction" form.
6. **Acceptance.** Add syrupUSDT through the admin UI with zero code changes. Then do the remaining 18 assets the same way.

## 8. Trade-offs

| Decision | What we gain | What we give up | Mitigation |
|---|---|---|---|
| Postgres for editing, Git as a synced copy | Forms, gap reports, history queries, and PR review and `git log` are kept | Two copies that can drift | `bun rwa check`, import on merge, export on admin edit |
| Templates as data, not code | New assets need no code; templates are shared across a platform | Type checking and editor support for handler logic | zod schema for templates, dry-run with warnings, golden tests per template |
| Site reads from the database | Edits show without a redeploy | The site depends on the database being up | ISR keeps the last good render, and `getCatalog()` falls back to the Git copy on a query error |
| One admin account | Simple | No multi-curator workflow yet | `entered_by` and `reviewed_by` columns are there for when contributors join |
