import { AlertsFeed } from "@/components/alerts/alerts-feed";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { getAlerts } from "@/lib/live-store";
import { getProfiles } from "@/lib/profile";

export const metadata = { title: "Alerts" };
export const revalidate = 300;

export default async function AlertsPage() {
  const alerts = await getAlerts();
  const tickers = Object.fromEntries((await getProfiles()).map((p) => [p.asset.slug, p.asset.ticker]));

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
      </div>
      <AlertsFeed alerts={alerts} tickers={tickers} />
    </>
  );
}
