# RWABeat — Design Specification

> Version 0.1 · Oct 2026 · Companion to [PRD.md](./PRD.md) and [TECH_SPEC.md](./TECH_SPEC.md)

## 1. Direction

**Borrow rwa.xyz's structure, not its identity.**

What makes rwa.xyz look professional, and what we keep:
- Calm, mostly white interface with a light grey page background and white cards with thin borders.
- Persistent left sidebar with small grey section labels and icon + text links.
- Top bar with a large command-style search (`⌘K`).
- Breadcrumbs, then a big H1, a one-line description, and small tag pills.
- A **stat row**: label with an info icon, large number, small red/green delta underneath.
- Cards with a title, segmented-tab controls, and a chart or table inside.
- Dense, well-aligned tables with tabular numbers.
- Generous whitespace, very little color; color only carries meaning.

What makes us different:
- **Risk is the hero, not market size.** The rosette and "What can go wrong" sit above the fold where rwa.xyz puts its AUM chart.
- **Own accent color:** deep indigo (`#3B3BD9`) instead of rwa.xyz's blue, plus a strict risk palette (green/amber/red/grey) used only for risk.
- **Evidence everywhere:** every value has a small source marker that opens the source on hover/click.
- **Addresses as first-class UI:** monospace address chips with type icons (key, multisig, clock).
- **Optional dark mode**, which rwa.xyz doesn't emphasize, since crypto researchers often prefer it.

## 2. Design tokens

### 2.1 Color

```css
/* Light theme */
--bg:            #F7F8FA;  /* page background */
--surface:       #FFFFFF;  /* cards, sidebar, topbar */
--surface-muted: #F2F4F7;  /* table header, segmented control bg */
--border:        #E4E7EC;
--border-strong: #D0D5DD;
--text:          #101828;
--text-muted:    #475467;
--text-subtle:   #98A2B3;  /* section labels, axis labels */

--accent:        #3B3BD9;  /* links, active nav, primary buttons */
--accent-soft:   #EEF0FF;  /* active nav bg, selected tab */

/* Risk palette: only for risk meaning */
--risk-green:    #12B76A;  --risk-green-soft:  #ECFDF3;
--risk-yellow:   #F79009;  --risk-yellow-soft: #FFFAEB;
--risk-red:      #F04438;  --risk-red-soft:    #FEF3F2;
--risk-grey:     #98A2B3;  --risk-grey-soft:   #F2F4F7;

/* Deltas (market numbers) */
--up:   #12B76A;
--down: #F04438;
```

Dark theme: `--bg #0B0D12`, `--surface #12151C`, `--border #232836`, `--text #F2F4F7`, `--text-muted #A0A8B8`. Same risk hues, soft variants at ~12% opacity.

Charts: a 10-color categorical palette that **excludes** pure red/green/amber so charts never look like risk signals:
`#3B3BD9 #6CA0F5 #8E7CF0 #36BFFA #F178B6 #A6A3FF #7CD4C4 #FDB97D #9CA3AF #C4B5FD`.

### 2.2 Typography
- **UI and numbers:** Inter (or Geist), with `font-feature-settings: "tnum"` on all numbers.
- **Addresses, hashes, code:** JetBrains Mono (or Geist Mono).

| Token | Size / line height / weight | Use |
|---|---|---|
| `display` | 32 / 40 / 600 | Page H1 |
| `stat` | 28 / 36 / 500 | Stat row numbers |
| `h2` | 18 / 28 / 600 | Card titles |
| `body` | 14 / 20 / 400 | Default |
| `small` | 13 / 18 / 400 | Table cells, descriptions |
| `label` | 12 / 16 / 500 | Section labels, stat labels (`--text-subtle`) |
| `micro` | 11 / 14 / 500, uppercase, 0.04em tracking | Sidebar group headings |

### 2.3 Spacing, radius, shadow
- 4px grid. Card padding 20px (desktop), 16px (mobile). Gap between cards 16px.
- Radius: 4px (inputs, pills), 6px (cards).
- Shadow: none by default; `0 1px 2px rgba(16,24,40,0.05)` on cards; popovers `0 8px 24px rgba(16,24,40,0.12)`.

## 3. Layout

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ◉ RWABeat │ Independent risk profiles   [ 🔍 Search asset, issuer, address…  ⌘K ]  Methodology  GitHub ★ │  ← Topbar 64px
├─────────────┬────────────────────────────────────────────────────────────────────────┤
│ OVERVIEW    │  Home / Treasuries / BUIDL                                             │  ← Breadcrumb
│ ⌂ Home      │                                                                        │
│ ⚲ Screener  │  Page content (max-width 1440, fluid)                                 │
│ 🔔 Alerts   │                                                                        │
│ ⇄ Compare   │                                                                        │
│             │                                                                        │
│ ASSET CLASSES                                                                        │
│ 🏛 Treasuries│                                                                        │
│ 💳 Private   │                                                                        │
│    credit   │                                                                        │
│             │                                                                        │
│ ENTITIES    │                                                                        │
│ 🏢 Issuers   │                                                                        │
│ 🔐 Custodians│                                                                        │
│ 📡 Oracles   │                                                                        │
│ 🔑 Multisigs │                                                                        │
│             │                                                                        │
│ RESEARCH    │                                                                        │
│ 📐 Methodology                                                                       │
│ 📝 Reports   │                                                                        │
│ 📖 Learn     │                                                                        │
│ 🕒 Changelog │                                                                        │
│             │                                                                        │
│ ┌─────────┐ │                                                                        │
│ │Suggest a│ │                                                                        │
│ │correction│ │                                                                       │
│ └─────────┘ │                                                                        │
├─────────────┴────────────────────────────────────────────────────────────────────────┤
│ Footer: Disclaimer · Methodology · GitHub · X · Telegram · RSS                         │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- Sidebar 240px, collapsible to 64px icons-only. On mobile becomes a sheet.
- Use **Lucide** icons (not emoji; emoji above are placeholders).
- Topbar search opens a command palette (shadcn `Command`) searching assets, entities, and **addresses** (paste an address → shows which asset/role it belongs to).

## 4. Pages

### 4.1 Home

```
Tokenized assets, risk-checked.                                        Live data updated 2h ago  [⤓ CSV]
Independent, open-source risk profiles for tokenized real-world assets. Every fact sourced.

[Value tracked]           [Single-key critical powers]  [At Stage 0 or above]      [Alerts, last 7 days]
 $7.32B                    $7.19B                        $6.00B                      1
 10 assets · 5 treasuries  ██████████████░ 98% of value  ████████████░░ 82% of value 1 medium

┌─ Risk overview ───────────── [By value | By count] ─┐  ┌─ Market share ─ [Platform | Issuer | Class] ─┐
│                                               Red   │  │ Hashnote (Circle) ████████████  $2.37B  32%  │
│ Underlying Asset ████green███ ██yellow █ ░░░░░  2%  │  │ Securitize        ███████████   $2.20B  30%  │
│ Legal Claim      ░░░░░░░ not assessed ░░░░░░░   —   │  │ Maple Finance     ████          $984.8M 13%  │
│ …                                                   │  │ …  (tail past 8 rows folds into "Other")     │
│ ■ Green ■ Yellow ■ Red ▨ Unverified ▨ Not assessed  │  └──────────────────────────────────────────────┘
└─────────────────────────────────────────────────────┘

┌─ Assets · ranked by value ───────────────────────────────────────────── [All | Treasuries | Credit] ─┐
│ #  Asset                               Value · share  Backing Parties Control Transp. Pricing Exit  Stage   │
│ 1  (rosette) USYC  Circle USYC         $2.37B          ●       ●       ●       ●       ●      ◌    Stage 0 › │
│              Hashnote · Treasuries     ▬▬──── 32%                                                          │
│ …                                                                                                          │
│ ● Green ● Yellow ● Red ◌ Unverified                       Flags, chains and DeFi exposure in the screener → │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─ Latest alerts ─────────────────────────────────────────────────────────────────────── View all ─┐
│ ○ MEDIUM · 4d ago   21,500,000 BUIDL burned on ethereum                                    BUIDL │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Every chart mark has a hover/focus tooltip (`ChartTooltip`): the risk bars list value, share and asset count per rating; a rating dot shows the category headline; a market-share bar lists the assets in that group. Each also has a visible number (the Red column, share labels) so the tooltip never gates a value.
- The home table stays a summary that fits without horizontal scroll: issuer and class sit under the ticker (issuer shortened with `shortEntityName`), the rosette takes the logo slot, and flags, chains and DeFi data live in the screener. Below `md` the table becomes a card list.

### 4.2 Asset page: Overview tab

```
Home / Treasuries / BUIDL

[BUIDL logo]  BlackRock USD Institutional Digital Liquidity Fund
Tokenized money market fund investing in cash, US T-bills and repo.
[U.S. Treasuries] [Qualified purchasers] [Transfer-restricted]   Issued by BlackRock · Platform Securitize

[Value ⓘ]    [Stage ⓘ]         [Single-key powers ⓘ]   [Oracle age ⓘ]   [Used as DeFi collateral ⓘ]
 $2.25B        Stage 0           0                       3h 12m            $41.2M · 3 markets
 ▼ 20% 30d     Disclosed                                 ● on schedule

Overview | Underlying | Legal | Counterparties | Control | Transparency | Pricing | Exit | DeFi exposure | History | Sources
─────────

┌─ Risk rosette ──────────────────┐  ┌─ What can go wrong ─────────────────────────────────────────┐
│                                 │  │ ● A single key can replace the contract code.     Control ↗ │
│  (seven-wedge rosette; striped  │  │ ● BNY is both custodian and administrator.  Counterparties ↗│
│   wedges are unverified)        │  │ ○ The settlement time isn't public.                  Exit ↗ │
│   Underlying Asset ● green      │  │ ● The NAV comes from the issuer.                  Pricing ↗ │
│   Legal Claim ○ not assessed    │  │                                                            │
│   Counterparties ● yellow       │  │ Legal Claim: not assessed yet. What we know →             │
│   Control ● red                 │  └────────────────────────────────────────────────────────────┘
│   Transparency ● green          │
│   Pricing ● yellow              │  ┌─ Stage 0 · Disclosed ──────────────────────────────────────┐
│   Exit ◌ unverified ≥ yellow    │  │ Stage 0 ✓✓✓✓ · Stage 1 – legal ✓ ✗ ✗ ✗ · Stage 2 – ✗ ✗ ✗ ✗ │
└─────────────────────────────────┘  └────────────────────────────────────────────────────────────┘

┌─ Key facts ──────────────────────────┐  ┌─ Service providers ──────────────────────┐
│ Vehicle       BVI fund         [src] │  │ Custodian           BNY            [src] │
│ Jurisdiction  British Virgin Is. [src]│  │ Fund administrator  Securitize     [src] │
│ LEI           5299…YK24  ✓ GLEIF [src]│  │ Auditor             PwC            [src] │
│ SEC CIK       0002013810 (Form D)[src]│  │ Holdings reporting  Chronicle PoA  [src] │
│ Min. investment  $5,000,000      [src]│  └─────────────────────────────────────────┘
└──────────────────────────────────────┘

┌─ Deployments ───────────────────────────────────────────────────────────────┐
│ Chain      Address          Supply     Control   Upgrade path            │
│ Ethereum   0x7712…2AEc ⧉    $443.2M    ● yellow  Safe 3/5 · no delay      │
│ …                                                                         │
└───────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Asset page: Control tab

```
┌─ Who controls BUIDL on [Ethereum ▾] ─────────────────── [Graph | Table] ──┐
│                                                                           │
│  [Token proxy 0x7712…] ──upgrade──► [ProxyAdmin 0x…] ──owner──► [🔐 Safe 3/5]│
│        │                                                        ├ 0xa1… │
│        ├──mint (ISSUER)────────────► [🔐 Safe 2/3] ─── yellow    ├ 0xb2… │
│        ├──seize (TRANSFER_AGENT)───► [🔑 EOA 0xc3…]  ─── red     └ …     │
│        └──pause (MASTER)───────────► [⏱ Timelock 2d] → [🔐 Safe 3/5]      │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

┌─ Powers ─────────────────────────────────────────────────────────────────────┐
│ Power           Criticality  Held by               Checks           Status   │
│ Upgrade         Critical     Safe 3/5 (0x…)        No delay         ● yellow │
│ Mint            Critical     Safe 2/3 (0x…)        No delay         ● red    │
│ Force-transfer  Critical     EOA 0xc3…             None             ● red    │
│ Pause           High         Timelock 2d → Safe    2-day delay      ● green  │
│ Unclassified    —            0x…  `setRegistry()`  Needs review     ○ grey   │
└──────────────────────────────────────────────────────────────────────────────┘
ⓘ For regulated securities, freeze and force-transfer are often legally required. We rate who holds them and what checks apply.
Discovered at block 23,500,000 · 5 Oct 2026 · View raw JSON on GitHub ↗
```

Graph styling: nodes are cards (12px radius) with a type icon; edges labeled with the power; edge color = the risk color of that power's status. Critical edges 2px, others 1px.

### 4.4 Other tabs (brief)
- **Pricing:** card with current price/NAV, source contract, signer(s), update cadence, an **age gauge** (green within cadence, amber 1–3×, red > 3×), and a 30-day line chart of the NAV with update points.
- **DeFi exposure:** table of markets (protocol logo, chain, loan asset, LLTV, oracle used, collateral USD, borrowed USD, utilization) + donut by protocol. Flag rows whose oracle hardcodes the price.
- **Every category tab** opens with a category card: rating tag, the question it answers, every check (passed ones too) with its source, and context notes that don't change the rating.
- **Underlying:** holdings table (dated report or mandate), maturity and credit facts, track record.
- **Legal:** "not assessed" with the questions it will cover, plus legal structure and public records.
- **Counterparties:** providers table (independent of issuer, regulated or auditor tier), settlement rails, other dependencies.
- **Transparency:** reports table on the four ladders with ✓/✗ per column and the report that counts marked; event reporting; data kept private for a reason. "Adapted from Chronicle Labs" credit line.
- **Exit:** redemption terms, liquidator access, top-holder concentration, instant facilities, and measured DEX sells of $1M / $5M / $10M.
- **History:** timeline of alerts and discovery diffs (vertical timeline, icon by severity).
- **Sources:** every source cited on the page, grouped by tab, with `checkedAt` dates.

### 4.5 Screener
Full-width TanStack table. The asset column (rosette, ticker, issuer · class) is sticky so wide column sets scroll under it. Default columns: asset, value, the six rated categories, stage, and flags (the worst flag plus "+n", the rest in a tooltip). Class, issuer, Legal Claim, onchain data, chains, DeFi collateral and oracle age are toggleable under Columns. Two filter rows above the table: asset class, chain, rating per category, with Columns and Download CSV on the right (matching rwa.xyz's placement); then "Only show" chips for "single-key critical power", "Stage 0 or above", "used as collateral", "price stale".

### 4.6 Alerts
Two-column: filter rail (severity, asset, chain, kind) + feed of alert cards. Each card: severity dot, title, asset chip, time ago, one-line consequence, link to tx on explorer, and "View change" (discovery diff).

### 4.7 Methodology and Learn
Docs layout: left table of contents, MDX content with max-width 720px, right "On this page" anchors. Learn pages use callout boxes ("In plain English", "Why curators care").

## 5. Components

| Component | Notes |
|---|---|
| `StatCard` | Label + ⓘ tooltip, value (`stat` size, tabular), optional delta (▲/▼ colored), optional status dot |
| `Rosette` | SVG circle with 7 wedges, one per category, Underlying Asset at the top; solid risk color, stripes in the floor color for unverified, grey hatch for not assessed; hover shows the headline; `size="sm"` (24px, for tables, no SVG patterns) and `size="lg"` (220px) |
| `RiskDot` | 8px dot + optional label; solid risk colors, dashed ring for unverified, light grey for not assessed, grey ring for neutral |
| `StageCard` / `StageBadge` | Stage title and the three-stage checklist (✓ met, ✗ not met, – legal, not assessed); pill for tables |
| `RiskList` | Ordered list of risks with severity dot, sentence, and evidence link ↗ |
| `SourceMarker` | Tiny superscript `[src]` or link icon; hover popover shows URL/tx, note, checkedAt |
| `AddressChip` | Mono short address `0x7712…2AEc`, type icon (🔑 EOA, 🔐 Safe m/n, ⏱ timelock, 📄 contract), copy button, explorer link, optional label ("BlackRock ops Safe") |
| `SegmentedTabs` | rwa.xyz-style pill group on `--surface-muted` background; active = white with shadow |
| `DataTable` | Sticky header, `--surface-muted` header bg, row hover `--bg`, right-aligned numbers, sortable column icons |
| `Tag` | 8px radius, 1px border, 12px text; variants: neutral, accent, risk-* |
| `PermissionGraph` | React Flow with dagre auto-layout left→right, read-only, zoom controls, "fit view" |
| `Timeline` | Vertical line with severity dots, used in History and Alerts |
| `EmptyUnknown` | Standard treatment for unknown data: grey text "Not found" + "Help us find it" link |

## 6. Interaction and content rules

- Numbers: `$2.25B`, `$443.2M`, `3.66%`; full value on hover. Dates as "5 Oct 2026"; relative times ("2h ago") with absolute time on hover (as rwa.xyz does).
- Risk text is plain English, one sentence, consequence first: "A single key can mint unlimited tokens" not "MINTER_ROLE assigned to EOA".
- Never use red/green for anything that isn't risk or delta.
- Every info icon explains the metric in one or two sentences and links to the methodology section.
- Loading: skeletons matching card shapes. Errors: inline in the card, never full-page.
- Accessibility: risk color is always paired with a text label or icon (color-blind safe); WCAG AA contrast; full keyboard navigation in the command palette and tables.

## 7. Responsive

| Breakpoint | Behavior |
|---|---|
| ≥ 1280px | Sidebar expanded, 2–3 column card grids |
| 1024–1279px | Sidebar collapsed to icons, 2 columns |
| 768–1023px | Sidebar becomes sheet, 1–2 columns, stat row scrolls horizontally |
| < 768px | Single column, tables become stacked cards for screener/alerts, rosette stays visible at top of asset page |

## 8. Brand

- Logo: a simple hexagonal rosette mark (six wedges) + wordmark "RWABeat" in Inter 600.
- Tone: neutral, precise, evidence-first. No hype, no emoji in product UI.
- Open Graph images per asset: name, ticker, rosette, and top risk sentence, generated with `@vercel/og`, so shared links look good on X.
