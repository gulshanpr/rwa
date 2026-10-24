import Link from "next/link";
import { AlertCard } from "@/components/alerts/alert-card";
import { SampleBanner } from "@/components/data/sample-banner";
import { StatCard } from "@/components/data/stat-card";
import { AssetsTable } from "@/components/home/assets-table";
import { RiskOverview } from "@/components/home/risk-overview";
import { Card } from "@/components/ui/card";
import { getAlerts } from "@/lib/live-store";
import { formatPct, formatUsd, formatUsdFull } from "@/lib/format";
import { getProfiles } from "@/lib/profile";
import { assetRows, sliceDistribution } from "@/lib/rows";
import { bestMethod, passCount } from "@/lib/scoring/verification";
import { SITE } from "@/lib/site";

export const revalidate = 300;

export default async function HomePage() {
  const profiles = (await getProfiles());
  const rows = await assetRows();
  const { alerts, sample: alertsSample } = (await getAlerts());
  const tickers = new Map(profiles.map((p) => [p.asset.slug, p.asset.ticker]));

  const total = profiles.reduce((s, p) => s + (p.stats.aumUsd ?? 0), 0);
  const has30d = profiles.length > 0 && profiles.every((p) => p.live?.aum.usd30dAgo !== undefined);
  const total30d = profiles.reduce((s, p) => s + (p.live?.aum.usd30dAgo ?? 0), 0);
  const eoaValue = profiles.filter((p) => p.stats.singleKeyPowers > 0).reduce((s, p) => s + (p.stats.aumUsd ?? 0), 0);
  const verifiedValue = profiles
    .filter((p) => {
      const best = bestMethod(p.asset);
      return best && passCount(best) === 5;
    })
    .reduce((s, p) => s + (p.stats.aumUsd ?? 0), 0);
  const weekAgo = Date.now() - 7 * 86400 * 1000;
  const alerts7d = alerts.filter((a) => new Date(a.publishedAt).getTime() >= weekAgo).length;
  const delta = total30d ? total / total30d - 1 : 0;
  const share = (v: number) => (total ? formatPct(v / total, 0) : "0%");

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[26px] leading-9 font-semibold text-fg md:text-display">Tokenized assets, risk-checked.</h1>
        <p className="mt-1.5 max-w-2xl text-body text-fg-muted">{SITE.description}</p>
      </div>
      {(profiles.some((p) => p.sample) || alertsSample) && <SampleBanner />}

      <div className="-mx-4 mb-6 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 lg:grid lg:grid-cols-5 lg:overflow-visible">
        <StatCard
          label="Assets tracked"
          info="Tokenized Treasury and private-credit assets with a published risk profile. The v1 target is the 20 largest."
          infoHref="/methodology#scope"
          value={profiles.length}
          sub="+2 since last report"
        />
        <StatCard
          label="Value covered"
          info="Combined assets under management of tracked assets, as published by each asset's AUM source."
          infoHref="/methodology#data"
          value={formatUsd(total)}
          valueTitle={formatUsdFull(total)}
          delta={has30d ? { value: formatPct(Math.abs(delta), 1), direction: delta >= 0 ? "up" : "down", suffix: "30d" } : undefined}
        />
        <StatCard
          label="Value with single-key critical powers"
          info="Value of assets where one key (EOA) or unrecognized contract can upgrade, mint, seize, burn, reprice, or grant roles."
          infoHref="/methodology#control"
          value={formatUsd(eoaValue)}
          sub={`· ${share(eoaValue)}`}
        />
        <StatCard
          label="Value passing all 5 verification tests"
          info="Independent, asset-level, daily, verifiable and onchain reserve data. Tests adapted from Chronicle Labs."
          infoHref="/methodology#verification"
          value={formatUsd(verifiedValue)}
          sub={`· ${share(verifiedValue)}`}
        />
        <StatCard
          label="Alerts (7d)"
          info="Onchain changes to tracked contracts in the last 7 days: upgrades, role changes, Safe changes, large mints, stale oracles."
          infoHref="/alerts"
          value={alerts7d}
        />
      </div>

      <div className="grid gap-4">
        <RiskOverview data={sliceDistribution(rows)} />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <AssetsTable rows={rows} />
          <Card
            title="Latest alerts"
            actions={
              <Link href="/alerts" className="text-small text-accent hover:underline">
                View all
              </Link>
            }
          >
            {alerts.length === 0 && (
              <p className="text-small text-fg-muted">No alerts yet. The event watcher checks every tracked contract for upgrades, role changes and pauses.</p>
            )}
            <ul className="divide-y divide-line">
              {alerts.slice(0, 5).map((a) => (
                <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                  <AlertCard alert={a} ticker={tickers.get(a.asset) ?? a.asset.toUpperCase()} compact />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
