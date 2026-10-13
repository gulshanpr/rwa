import Link from "next/link";
import { notFound } from "next/navigation";
import { AddressChip } from "@/components/data/address-chip";
import { disclosedFact, FactList } from "@/components/data/fact-list";
import { RiskList } from "@/components/risk/risk-list";
import { RosetteCard } from "@/components/risk/rosette-card";
import { SliceDot } from "@/components/risk/slice-dot";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { CHAINS } from "@/lib/chains";
import { formatUsd, formatUsdFull } from "@/lib/format";
import { INVESTOR_LABELS, TOKEN_STANDARD_LABELS } from "@/lib/labels";
import { getProfile, nameOf } from "@/lib/profile";
import { worstColor } from "@/lib/scoring/types";
import { RISK_WORD } from "@/lib/ui";

export default async function OverviewPage({ params }: PageProps<"/assets/[slug]">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, score, powers, live } = profile;
  const entityName = (s: string) => nameOf(profile, s);
  const { legal, serviceProviders: sp, access } = asset;
  const verification = asset.verification.methods[0];

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <RosetteCard slices={score.slices} slug={slug} ticker={asset.ticker} />
        <Card
          title="What can go wrong"
          description={`The top risks we found, worst first. ${score.risks.length} findings in total.`}
        >
          <RiskList reasons={score.risks} slug={slug} limit={5} />
          {score.risks.length > 5 && (
            <p className="mt-3 text-small text-fg-muted">
              +{score.risks.length - 5} more in the slice tabs.
            </p>
          )}
          <p className="mt-4 rounded-control bg-subtle px-3 py-2.5 text-small text-fg-muted">
            <strong className="font-medium text-fg">Legal &amp; insolvency: not assessed yet.</strong> We don&apos;t yet
            evaluate what happens to holders if the issuer fails.{" "}
            <Link href={`/assets/${slug}/disclosure`} className="text-accent hover:underline">
              What we know →
            </Link>
          </p>
        </Card>
      </div>

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
              disclosedFact("SEC CIK", legal.secFilings, (v) => (
                <span>
                  <span className="font-mono text-[12px]">{v.cik}</span> (Form {v.forms.join(", ")})
                </span>
              )),
              disclosedFact("Min. investment", access.minimumInvestment, (v) => <span className="tnum">{formatUsdFull(v)}</span>),
              {
                label: "Who can hold",
                value: INVESTOR_LABELS[access.investorType.value],
                source: access.investorType.source,
              },
              { label: "Token standard", value: TOKEN_STANDARD_LABELS[asset.tokenStandard] },
            ]}
          />
        </Card>
        <Card title="Service providers">
          <FactList
            facts={[
              disclosedFact("Custodian", sp.custodian, entityName),
              disclosedFact("Fund administrator", sp.fundAdministrator, entityName),
              disclosedFact("Auditor", sp.auditor, entityName),
              disclosedFact("Transfer agent", sp.transferAgent, entityName),
              verification
                ? {
                    label: "Verification",
                    value: `${entityName(verification.provider)} · ${verification.type.replace(/-/g, " ")}`,
                    source: verification.source,
                  }
                : { label: "Verification", value: "None found" },
            ]}
          />
        </Card>
      </div>

      <Card title="Deployments" description="EVM deployments tracked in v1.">
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
              const color = worstColor(rows.map((r) => r.color).filter((c) => c !== "grey"));
              return (
                <Tr key={d.chain}>
                  <Td className="font-medium">{CHAINS[d.chain].name}</Td>
                  <Td>
                    <AddressChip address={d.token} chain={d.chain} />
                  </Td>
                  <Td align="right">
                    {supply ? (
                      <span title={formatUsdFull(supply.totalSupply * supply.priceUsd)}>
                        {formatUsd(supply.totalSupply * supply.priceUsd)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    <SliceDot color={color} label={<span className="text-fg-muted">{RISK_WORD[color]}</span>} />
                  </Td>
                  <Td className="text-fg-muted">
                    {upgrade
                      ? `${upgrade.holder.path.map((s) => s.label).join(" → ")} · ${upgrade.checks.toLowerCase()}`
                      : "Not upgradeable"}
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
