import Link from "next/link";
import { notFound } from "next/navigation";
import { AddressChip } from "@/components/data/address-chip";
import { disclosedFact, FactList } from "@/components/data/fact-list";
import { RiskDot } from "@/components/risk/risk-dot";
import { RiskList } from "@/components/risk/risk-list";
import { RosetteCard } from "@/components/risk/rosette-card";
import { StageCard } from "@/components/risk/stage-card";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { CHAINS } from "@/lib/chains";
import { formatUsd, formatUsdFull } from "@/lib/format";
import { bestReport } from "@/lib/framework/transparency";
import type { Tone } from "@/lib/framework/types";
import { FRESHNESS_LABELS, INVESTOR_LABELS, TOKEN_STANDARD_LABELS } from "@/lib/labels";
import { getProfile, nameOf } from "@/lib/profile";
import { RISK_WORD } from "@/lib/ui";

const TONE_RANK: Record<Tone, number> = { grey: 0, green: 1, yellow: 2, red: 3 };
/** The overview shows at most this many findings per category, so one category can't fill the list. */
const PER_CATEGORY = 2;
const SHOWN = 6;

export default async function OverviewPage({ params }: PageProps<"/assets/[slug]">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, rating, powers, live } = profile;
  const entityName = (s: string) => nameOf(profile, s);
  const { legal, counterparties: cp, access } = asset;
  const best = bestReport(asset);
  const perCategory = new Map<string, number>();
  const top = rating.risks
    .filter((f) => {
      const n = perCategory.get(f.category) ?? 0;
      perCategory.set(f.category, n + 1);
      return n < PER_CATEGORY;
    })
    .slice(0, SHOWN);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <RosetteCard categories={rating.categories} slug={slug} ticker={asset.ticker} />
        <Card
          title="What can go wrong"
          description={`Red findings first, then facts that aren't public, then yellow. ${rating.risks.length} in total.`}
        >
          <RiskList findings={top} slug={slug} linkCategory />
          {rating.risks.length > top.length && (
            <p className="mt-3 text-small text-fg-muted">+{rating.risks.length - top.length} more in the category tabs.</p>
          )}
          <p className="mt-4 rounded-control bg-subtle px-3 py-2.5 text-small text-fg-muted">
            <strong className="font-medium text-fg">Legal Claim: not assessed yet.</strong> We don&apos;t yet judge bankruptcy
            remoteness or what the token legally gives holders.{" "}
            <Link href={`/assets/${slug}/legal`} className="text-accent hover:underline">
              What we know →
            </Link>
          </p>
        </Card>
      </div>

      <StageCard stage={rating.stage} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Key facts">
          <FactList
            facts={[
              disclosedFact("Vehicle", legal.vehicleType),
              disclosedFact("Jurisdiction", legal.jurisdiction),
              disclosedFact("LEI", legal.lei, (v) => (
                <span className="font-mono text-[12px]">
                  {v} <span className="font-sans text-risk-green">✓ GLEIF</span>
                </span>
              )),
              disclosedFact("Min. investment", access.minimumInvestment, (v) => <span className="tnum">{formatUsdFull(v)}</span>),
              { label: "Who can hold", value: INVESTOR_LABELS[access.investorType.value], source: access.investorType.source },
              { label: "Rated as", value: FRESHNESS_LABELS[asset.freshnessClass.value], source: asset.freshnessClass.source },
              { label: "Token standard", value: TOKEN_STANDARD_LABELS[asset.tokenStandard] },
            ]}
          />
        </Card>
        <Card title="Service providers">
          <FactList
            facts={[
              disclosedFact("Custodian", cp.custodian, entityName),
              disclosedFact("Fund administrator", cp.fundAdministrator, entityName),
              disclosedFact("Auditor", cp.auditor, entityName),
              disclosedFact("Transfer agent", cp.transferAgent, entityName),
              best
                ? { label: "Holdings reporting", value: `${best.name} (${entityName(best.provider)})`, source: best.source }
                : { label: "Holdings reporting", value: "None found" },
            ]}
          />
        </Card>
      </div>

      <Card title="Deployments" description="EVM deployments we track, with the worst power found on each.">
        <Table>
          <thead>
            <tr>
              <Th>Chain</Th>
              <Th>Token</Th>
              <Th align="right">Supply</Th>
              <Th>Control</Th>
              <Th>Upgrade path</Th>
            </tr>
          </thead>
          <tbody>
            {asset.deployments.map((d) => {
              const supply = live?.supply.find((s) => s.chain === d.chain);
              const rows = powers.filter((r) => r.chain === d.chain);
              const upgrade = rows.find((r) => r.power === "upgrade");
              const color = rows.map((r) => r.color).reduce<Tone>((w, t) => (TONE_RANK[t] > TONE_RANK[w] ? t : w), "grey");
              return (
                <Tr key={d.chain}>
                  <Td className="font-medium">{CHAINS[d.chain].name}</Td>
                  <Td>
                    <AddressChip address={d.token} chain={d.chain} />
                  </Td>
                  <Td align="right">
                    {supply ? <span title={formatUsdFull(supply.totalSupply * supply.priceUsd)}>{formatUsd(supply.totalSupply * supply.priceUsd)}</span> : "—"}
                  </Td>
                  <Td>
                    <RiskDot color={color} label={<span className="text-fg-muted">{RISK_WORD[color]}</span>} />
                  </Td>
                  <Td className="text-fg-muted">
                    {upgrade ? `${upgrade.holder.path.map((s) => s.label).join(" → ")} · ${upgrade.checks.toLowerCase()}` : "Not upgradeable"}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
