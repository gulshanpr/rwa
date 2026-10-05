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
- Radius: 8px (inputs, pills), 12px (cards).
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
Tokenized assets, risk-checked.
Independent, open-source risk profiles for tokenized real-world assets. Every fact sourced.

[Assets tracked]  [Value covered]   [Value with EOA-controlled   [Value passing all 5     [Alerts (7d)]
     20             $17.3B           critical powers]             verification tests]
                    ▲ 2.1% 30d        $X.XB · 18%                  $5.1B · 29%              7

┌─ Risk overview ──────────────────────────────────── [By value | By count] ─┐
│ Stacked horizontal bars, one per slice:                                    │
│ Control       ███████green████ ███yellow███ ██red██                         │
│ Pricing       ...                                                          │
│ Verification  ...                                                          │
│ Exit          ...                                                          │
│ Disclosure    ...                                                          │
│ Legal         ████████████████ grey: not assessed ███████████              │
└────────────────────────────────────────────────────────────────────────────┘

┌─ Assets ───────────────────────────────────────────── [Treasuries | Credit | All] ─┐   ┌─ Latest alerts ─────┐
│ # Asset            Issuer     Value    Rosette  Ctrl Price Verif Exit Discl  Flags │   │ ● CRITICAL 2h ago   │
│ 1 USYC  Circle…    Circle     $3.11B   (mini)   ●    ●     ●     ●    ●     EOA  │   │ USTB ProxyAdmin     │
│ 2 BENJI …          Franklin   $2.35B   (mini)   ●    ●     ●     ●    ●          │   │ owner changed       │
│ …                                                                                  │   │ ● HIGH 1d ago …     │
└────────────────────────────────────────────────────────────────────────────────────┘   └─────────────────────┘
```

### 4.2 Asset page: Overview tab

```
Home / Treasuries / BUIDL

[BUIDL logo]  BlackRock USD Institutional Digital Liquidity Fund
Tokenized money market fund investing in cash, US T-bills and repo.
[U.S. Treasuries] [Qualified purchasers] [Transfer-restricted]   Issued by BlackRock · Platform Securitize

[Value ⓘ]    [Admin roles ⓘ]   [Single-key powers ⓘ]   [Oracle age ⓘ]   [Used as DeFi collateral ⓘ]
 $2.25B        9                 0                       3h 12m            $41.2M · 3 markets
 ▼ 20% 30d                                               ● on schedule

Overview | Control | Pricing | DeFi exposure | Verification | Exit | Disclosure | History | Sources
─────────

┌─ Risk rosette ──────────────────┐  ┌─ What can go wrong ─────────────────────────────────────────┐
│                                 │  │ ● Upgrades take effect immediately (no timelock).         ↗ │
│        (hexagonal rosette)      │  │ ● DeFi markets price BUIDL at a fixed $1.                 ↗ │
│   Control ● yellow              │  │ ● Offering memorandum is not public.                      ↗ │
│   Pricing ● yellow              │  │ ● Redemption runs through the issuer only.                ↗ │
│   Verification ● green          │  │                                                            │
│   Exit ● yellow                 │  │ Legal & insolvency: not assessed yet. What we know →      │
│   Disclosure ● yellow           │  └────────────────────────────────────────────────────────────┘
│   Legal ○ not assessed          │
└─────────────────────────────────┘

┌─ Key facts ──────────────────────────┐  ┌─ Service providers ──────────────────────┐
│ Vehicle       BVI fund         [src] │  │ Custodian           BNY            [src] │
│ Jurisdiction  British Virgin Is. [src]│  │ Fund administrator  Securitize     [src] │
│ LEI           5299…YK24  ✓ GLEIF [src]│  │ Auditor             PwC            [src] │
│ SEC CIK       0002013810 (Form D)[src]│  │ Verification        Chronicle PoA  [src] │
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
ⓘ For regulated securities, freeze and force-transfer are often legally required. We score who holds them and what checks apply.
Discovered at block 23,500,000 · 5 Oct 2026 · View raw JSON on GitHub ↗
```

Graph styling: nodes are cards (12px radius) with a type icon; edges labeled with the power; edge color = the risk color of that power's status. Critical edges 2px, others 1px.

### 4.4 Other tabs (brief)
- **Pricing:** card with current price/NAV, source contract, signer(s), update cadence, an **age gauge** (green within cadence, amber 1–3×, red > 3×), and a 30-day line chart of the NAV with update points.
- **DeFi exposure:** table of markets (protocol logo, chain, loan asset, LLTV, oracle used, collateral USD, borrowed USD, utilization) + donut by protocol. Flag rows whose oracle hardcodes the price.
- **Verification:** five-test checklist (independent, asset-level, daily, verifiable, onchain) as rows with ✓/✗ and source; "Adapted from Chronicle Labs" credit line.
- **Exit:** redemption facts (who, how fast, minimums, gates) + instant-liquidity paths with depth.
- **Disclosure:** six-item checklist; `not_public` items show "Searched on 5 Oct 2026. Found it? Open a PR."
- **History:** timeline of alerts and discovery diffs (vertical timeline, icon by severity).
- **Sources:** every source cited on the page, grouped by tab, with `checkedAt` dates.

### 4.5 Screener
Full-width TanStack table. Columns toggleable. Filters as pills above the table: asset class, chain, slice color per slice, "has EOA critical power", "used as collateral", "price stale". Download CSV button on the right (matching rwa.xyz's placement).

### 4.6 Alerts
Two-column: filter rail (severity, asset, chain, kind) + feed of alert cards. Each card: severity dot, title, asset chip, time ago, one-line consequence, link to tx on explorer, and "View change" (discovery diff).

### 4.7 Methodology and Learn
Docs layout: left table of contents, MDX content with max-width 720px, right "On this page" anchors. Learn pages use callout boxes ("In plain English", "Why curators care").

## 5. Components

| Component | Notes |
|---|---|
| `StatCard` | Label + ⓘ tooltip, value (`stat` size, tabular), optional delta (▲/▼ colored), optional status dot |
| `Rosette` | SVG hexagon with 6 wedges; wedge fill = risk color; hover shows slice headline; `size="sm"` (24px, for tables) and `size="lg"` (220px) |
| `SliceDot` | 8px dot + optional label; colors from risk palette; grey ring for not assessed |
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
