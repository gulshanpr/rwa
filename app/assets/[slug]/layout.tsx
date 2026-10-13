import { Download } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssetTabs } from "@/components/asset/asset-tabs";
import { SampleBanner } from "@/components/data/sample-banner";
import { StatCard } from "@/components/data/stat-card";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Tag } from "@/components/ui/tag";
import { formatDuration, formatPct, formatUsd, formatUsdFull } from "@/lib/format";
import { INVESTOR_LABELS } from "@/lib/labels";
import { ASSET_CLASSES, getProfile, getProfiles } from "@/lib/profile";
import { POWER_LABELS } from "@/lib/scoring/control";
import type { SliceColor } from "@/lib/scoring/types";

export const dynamicParams = false;
export const revalidate = 300;

export async function generateStaticParams() {
  return (await getProfiles()).map((p) => ({ slug: p.asset.slug }));
}

export async function generateMetadata({ params }: LayoutProps<"/assets/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = (await getProfile(slug));
  if (!p) return {};
  return {
    title: `${p.asset.ticker} risk profile`,
    description: `${p.asset.name}: ${p.score.risks[0]?.text ?? p.asset.description}`,
  };
}

const FRESHNESS: Record<string, { color: SliceColor; label: string }> = {
  "on-schedule": { color: "green", label: "On schedule" },
  late: { color: "yellow", label: "Late" },
  stale: { color: "red", label: "Stale" },
};

export default async function AssetLayout({ children, params }: LayoutProps<"/assets/[slug]">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, stats, entities } = profile;
  const cls = ASSET_CLASSES[asset.assetClass];

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: cls.short, href: `/asset-classes/${cls.path}` },
          { label: asset.ticker },
        ]}
      />
      {profile.sample && <SampleBanner />}

      <header className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-4">
          <div
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold tracking-tight text-accent"
          >
            {asset.ticker.slice(0, 5)}
          </div>
          <div className="min-w-0">
            <h1 className="text-[24px] leading-8 font-semibold text-fg md:text-display">{asset.name}</h1>
            <p className="mt-1 text-body text-fg-muted">{asset.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Tag>{cls.label}</Tag>
              <Tag>{INVESTOR_LABELS[asset.access.investorType.value]} only</Tag>
              {asset.access.transferRestricted.value && <Tag>Transfer-restricted</Tag>}
              <span className="text-small text-fg-muted">
                Issued by {entities.manager?.name ?? asset.manager} · Platform {entities.platform?.name ?? asset.platform}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href={`/api/assets/${asset.slug}`}
            className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-small text-fg-muted hover:border-line-strong hover:text-fg"
          >
            <Download className="size-3.5" /> JSON
          </a>
          <a
            href={`/api/assets/${asset.slug}.csv`}
            className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-small text-fg-muted hover:border-line-strong hover:text-fg"
          >
            <Download className="size-3.5" /> CSV
          </a>
        </div>
      </header>

      <div className="-mx-4 mb-6 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 lg:grid lg:grid-cols-5 lg:overflow-visible">
        <StatCard
          label="Value"
          info={`Assets under management across all chains, from ${profile.live?.aum.source.name ?? "DefiLlama"}. Cross-checked against totalSupply × price.`}
          infoHref="/methodology#data"
          value={stats.aumUsd !== undefined ? formatUsd(stats.aumUsd) : "—"}
          valueTitle={stats.aumUsd !== undefined ? formatUsdFull(stats.aumUsd) : undefined}
          delta={
            stats.aumDelta30d !== undefined
              ? {
                  value: formatPct(Math.abs(stats.aumDelta30d), 0),
                  direction: stats.aumDelta30d >= 0 ? "up" : "down",
                  suffix: "30d",
                }
              : undefined
          }
        />
        <StatCard
          label="Admin roles"
          info="Number of privileged powers (upgrade, mint, freeze, pause…) found on the token and its service contracts."
          infoHref="/methodology#control"
          value={stats.adminRoles}
        />
        <StatCard
          label="Single-key powers"
          info="Critical powers (upgrade, mint, force-transfer, burn, set price, grant roles) that a single key (EOA) or unrecognized contract can use."
          infoHref="/methodology#control"
          value={stats.singleKeyPowers}
          status={
            stats.singleKeyPowers > 0
              ? { color: "red", label: "Single key holds critical power" }
              : stats.singleKeyOther.length > 0
                ? {
                    color: "yellow",
                    label: `None critical · can ${[...new Set(stats.singleKeyOther)].map((p) => POWER_LABELS[p].toLowerCase()).join(", ")}`,
                  }
                : { color: "green", label: "None found" }
          }
        />
        <StatCard
          label="Oracle age"
          info="Time since the onchain NAV/price was last updated, compared with its expected cadence."
          infoHref="/methodology#pricing"
          value={stats.oracle ? formatDuration(stats.oracle.ageSeconds) : asset.pricing.reference.type === "vault" ? "Live" : "—"}
          status={
            stats.oracle
              ? FRESHNESS[stats.oracle.freshness]
              : asset.pricing.reference.type === "vault"
                ? { color: "green", label: "NAV computed onchain every block" }
                : { color: "red", label: "No onchain price" }
          }
        />
        <StatCard
          label="Used as DeFi collateral"
          info="Collateral supplied in lending markets that accept this token (Morpho, Aave, Euler)."
          infoHref="/methodology#defi-exposure"
          value={formatUsd(stats.defiCollateralUsd)}
          sub={`· ${stats.defiMarkets} markets`}
        />
      </div>

      <AssetTabs slug={asset.slug} />
      {children}
    </>
  );
}
