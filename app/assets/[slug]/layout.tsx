import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssetLogo } from "@/components/asset/asset-logo";
import { AssetTabs } from "@/components/asset/asset-tabs";
import { SampleBanner } from "@/components/data/sample-banner";
import { StatCard } from "@/components/data/stat-card";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { STAGE_NAMES } from "@/components/risk/stage-card";
import { Tag } from "@/components/ui/tag";
import { formatDuration, formatPct, formatUsd, formatUsdFull } from "@/lib/format";
import { POWER_LABELS } from "@/lib/framework/permissions";
import { INVESTOR_LABELS } from "@/lib/labels";
import { ASSET_CLASSES, getProfile, getProfiles } from "@/lib/profile";
import type { RiskVisual } from "@/lib/ui";

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
    description: `${p.asset.name}: ${p.rating.risks[0]?.text ?? p.asset.description}`,
  };
}

const FRESHNESS: Record<string, { color: RiskVisual; label: string }> = {
  "on-schedule": { color: "green", label: "On schedule" },
  late: { color: "yellow", label: "Late" },
  stale: { color: "red", label: "Stale" },
};

export default async function AssetLayout({ children, params }: LayoutProps<"/assets/[slug]">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, stats, entities, rating } = profile;
  const stage = rating.stage;
  const cls = ASSET_CLASSES[asset.assetClass];

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: cls.short, href: `/screener?class=${cls.path}` },
          { label: asset.ticker },
        ]}
      />
      {profile.sample && <SampleBanner />}

      <header className="mb-5">
        <div className="flex min-w-0 gap-4">
          <AssetLogo slug={asset.slug} ticker={asset.ticker} />
          <div className="min-w-0">
            <h1 className="text-[24px] leading-8 font-semibold text-fg md:text-display">{asset.name}</h1>
            <p className="mt-1 text-body text-fg-muted">{asset.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Tag>{cls.label}</Tag>
              <Tag>{INVESTOR_LABELS[asset.access.investorType.value]} only</Tag>
              {asset.access.transferRestricted.value && <Tag>Transfer-restricted</Tag>}
              {rating.onchainData && (
                <Tag variant="accent" title="Holdings or reserve data is published onchain. Shown as a badge, not part of any rating.">
                  Onchain data
                </Tag>
              )}
              <span className="text-small text-fg-muted">
                Issued by {entities.manager?.name ?? asset.manager} · Platform {entities.platform?.name ?? asset.platform}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 [&>*]:min-w-0 max-md:[&>*:last-child]:col-span-2">
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
          label="Stage"
          info="How much holders have to trust the issuer: 0 Disclosed, 1 Protected, 2 Trust-minimized. Each stage builds on the last."
          infoHref="/methodology#stages"
          value={stage.stage === null ? "None" : `Stage ${stage.stage}`}
          status={
            stage.stage === null
              ? { color: "red", label: "Below Stage 0: key facts not disclosed" }
              : { color: "grey", label: stage.pendingLegal ? `${STAGE_NAMES[stage.stage]} · next stage needs legal review` : STAGE_NAMES[stage.stage] }
          }
        />
        <StatCard
          label="Single-key powers"
          info="Critical powers (upgrade, mint, force-transfer, burn, set price, allocate, grant roles) that a single key can use: an EOA, an unrecognized contract, or a 1-of-n multisig."
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
