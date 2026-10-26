import Link from "next/link";
import { AlertCard } from "@/components/alerts/alert-card";
import { RelativeTime } from "@/components/data/relative-time";
import { SampleBanner } from "@/components/data/sample-banner";
import { StatCard } from "@/components/data/stat-card";
import { AssetsTable } from "@/components/home/assets-table";
import { MarketShare } from "@/components/home/market-share";
import { RiskOverview } from "@/components/home/risk-overview";
import { Card } from "@/components/ui/card";
import { getAlerts } from "@/lib/live-store";
import { formatPct, formatUsd, formatUsdFull } from "@/lib/format";
import { shortEntityName } from "@/lib/labels";
import { ASSET_CLASSES, getProfiles } from "@/lib/profile";
import { assetRows, categoryDistribution, valueBy } from "@/lib/rows";
import type { AlertSeverity } from "@/lib/schema/live";
import { SITE } from "@/lib/site";

export const revalidate = 300;

const SEVERITIES: AlertSeverity[] = ["critical", "high", "medium", "low"];

export default async function HomePage() {
  const profiles = (await getProfiles());
  const rows = await assetRows();
  const alerts = await getAlerts();
  const tickers = new Map(profiles.map((p) => [p.asset.slug, p.asset.ticker]));

  const total = profiles.reduce((s, p) => s + (p.stats.aumUsd ?? 0), 0);
  const has30d = profiles.length > 0 && profiles.every((p) => p.live?.aum.usd30dAgo !== undefined);
  const total30d = profiles.reduce((s, p) => s + (p.live?.aum.usd30dAgo ?? 0), 0);
  const eoaValue = profiles.filter((p) => p.stats.singleKeyPowers > 0).reduce((s, p) => s + (p.stats.aumUsd ?? 0), 0);
  const stagedValue = profiles.filter((p) => p.rating.stage.stage !== null).reduce((s, p) => s + (p.stats.aumUsd ?? 0), 0);
  const weekAgo = Date.now() - 7 * 86400 * 1000;
  const alerts7d = alerts.filter((a) => new Date(a.publishedAt).getTime() >= weekAgo);
  const delta = total30d ? total / total30d - 1 : 0;
  const ratio = (v: number) => (total ? v / total : 0);
  const asOf = profiles.map((p) => p.live?.asOf).filter((t): t is string => Boolean(t)).sort().at(-1);
  const classCounts = Object.entries(ASSET_CLASSES)
    .map(([id, c]) => ({ label: c.short.toLowerCase(), n: rows.filter((r) => r.assetClass === id).length }))
    .filter((c) => c.n > 0);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-9 font-semibold text-fg md:text-display">Tokenized assets, risk-checked.</h1>
          <p className="mt-1.5 max-w-2xl text-body text-fg-muted">{SITE.description}</p>
        </div>
        <div className="flex items-center gap-3 text-small text-fg-muted">
          {asOf && (
            <span>
              Live data updated <RelativeTime iso={asOf} className="text-fg" />
            </span>
          )}
        </div>
      </div>
      {profiles.some((p) => p.sample) && <SampleBanner />}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          className="min-w-0"
          label="Value tracked"
          info="Combined assets under management of tracked assets, as published by each asset's AUM source. The v1 target is the 20 largest Treasury and private-credit assets."
          infoHref="/methodology#data"
          value={formatUsd(total)}
          valueTitle={formatUsdFull(total)}
          delta={has30d ? { value: formatPct(Math.abs(delta), 1), direction: delta >= 0 ? "up" : "down", suffix: "30d" } : undefined}
          note={`${profiles.length} assets · ${classCounts.map((c) => `${c.n} ${c.label}`).join(", ")}`}
        />
        <StatCard
          className="min-w-0"
          label="Single-key critical powers"
          info="Value of assets where one key (an EOA, an unrecognized contract or a 1-of-n multisig) can upgrade, mint, seize, burn, reprice, move the backing assets, or grant roles."
          infoHref="/methodology#control"
          value={formatUsd(eoaValue)}
          valueTitle={formatUsdFull(eoaValue)}
          meter={{ ratio: ratio(eoaValue), tone: "red", label: "of value" }}
        />
        <StatCard
          className="min-w-0"
          label="At Stage 0 or above"
          info="Holdings described, issuer, custodian, administrator and auditor named, legal structure documented, and contracts verified: the minimum to reach a stage."
          infoHref="/methodology#stages"
          value={formatUsd(stagedValue)}
          valueTitle={formatUsdFull(stagedValue)}
          meter={{ ratio: ratio(stagedValue), tone: "accent", label: "of value" }}
        />
        <StatCard
          className="min-w-0"
          label="Alerts, last 7 days"
          info="Onchain changes to tracked contracts in the last 7 days: upgrades, role changes, Safe changes, large mints, stale oracles."
          infoHref="/alerts"
          value={alerts7d.length}
          note={
            alerts7d.length === 0
              ? "No changes this week"
              : SEVERITIES.map((s) => ({ s, n: alerts7d.filter((a) => a.severity === s).length }))
                  .filter((x) => x.n > 0)
                  .map((x) => `${x.n} ${x.s}`)
                  .join(" · ")
          }
        />
      </div>

      <div className="grid gap-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <RiskOverview data={categoryDistribution(rows)} />
          <MarketShare
            data={{
              platform: valueBy(rows, (r) => r.platform),
              issuer: valueBy(rows, (r) => shortEntityName(r.manager)),
              class: valueBy(rows, (r) => ASSET_CLASSES[r.assetClass].label),
            }}
          />
        </div>
        <AssetsTable rows={rows} />
        <Card
          title="Latest alerts"
          description="Onchain and filing changes on tracked contracts, newest first."
          actions={
            <Link href="/alerts" className="text-small text-accent hover:underline">
              View all
            </Link>
          }
        >
          {alerts.length === 0 && (
            <p className="text-small text-fg-muted">No alerts yet. The event watcher checks every tracked contract for upgrades, role changes and pauses.</p>
          )}
          <ul className="grid gap-x-10 gap-y-5 lg:grid-cols-2">
            {alerts.slice(0, 4).map((a) => (
              <li key={a.id}>
                <AlertCard alert={a} ticker={tickers.get(a.asset) ?? a.asset.toUpperCase()} compact />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
