import { Rss } from "lucide-react";
import { AlertsFeed } from "@/components/alerts/alerts-feed";
import { SampleBanner } from "@/components/data/sample-banner";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { loadAlerts } from "@/lib/data";
import { getProfiles } from "@/lib/profile";

export const metadata = { title: "Alerts" };
export const revalidate = 300;

export default function AlertsPage() {
  const { alerts, sample } = loadAlerts();
  const tickers = Object.fromEntries(getProfiles().map((p) => [p.asset.slug, p.asset.ticker]));

  return (
    <>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Alerts" }]} />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-9 font-semibold md:text-display">Alerts</h1>
          <p className="mt-1 max-w-2xl text-body text-fg-muted">
            Onchain changes to tracked contracts: upgrades, admin and role changes, Safe signer changes, pauses, large
            mints and burns, and stale oracles.
          </p>
        </div>
        <a
          href="/api/alerts.rss"
          className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-small text-fg-muted hover:border-line-strong hover:text-fg"
        >
          <Rss className="size-3.5" /> RSS
        </a>
      </div>
      {sample && <SampleBanner />}
      <AlertsFeed alerts={alerts} tickers={tickers} />
    </>
  );
}
