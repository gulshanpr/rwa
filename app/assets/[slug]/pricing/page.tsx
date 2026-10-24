import { notFound } from "next/navigation";
import { AgeGauge } from "@/components/charts/age-gauge";
import { AddressChip } from "@/components/data/address-chip";
import { EmptyUnknown } from "@/components/data/empty-unknown";
import { FactList } from "@/components/data/fact-list";
import { RiskList } from "@/components/risk/risk-list";
import { SliceDot } from "@/components/risk/slice-dot";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Tag } from "@/components/ui/tag";
import { tabMetadata } from "@/lib/asset-meta";
import { CHAINS } from "@/lib/chains";
import { formatDateTime, formatDuration, formatUsdFull } from "@/lib/format";
import { PRICE_MODEL_LABELS, PROTOCOL_LABELS } from "@/lib/labels";
import { getProfile, nameOf } from "@/lib/profile";

export const generateMetadata = tabMetadata("Pricing");

const WRITER_LABELS = {
  eoa: "A single key (EOA)",
  "issuer-multisig": "Issuer-controlled multisig",
  "single-provider": "Single data provider",
  "oracle-network": "Independent oracle network",
} as const;

const VAULT_WRITER_LABELS = {
  eoa: "A single key (EOA) can write it down or back up",
  "issuer-multisig": "An issuer-controlled multisig can write it down or back up",
  governance: "Only timelocked governance can write it down",
  none: "Nobody; it follows the contract's accounting",
} as const;

const ORIGIN_LABELS = {
  issuer: "Issuer (self-reported)",
  "fund-administrator": "Fund administrator",
  custodian: "Custodian",
} as const;

export default async function PricingPage({ params }: PageProps<"/assets/[slug]/pricing">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, score, stats, live } = profile;
  const entityName = (s: string) => nameOf(profile, s);
  const ref = asset.pricing.reference;
  const age = stats.oracle;

  return (
    <div className="grid gap-4">
      <Card title="Pricing findings" description={score.slices.pricing.headline}>
        <RiskList reasons={score.slices.pricing.reasons} slug={slug} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Onchain price reference">
          {ref.type === "none" ? (
            <EmptyUnknown topic={`${asset.ticker} onchain price`} searchedAt={ref.searchedAt} note={ref.note} />
          ) : ref.type === "vault" ? (
            <FactList
              facts={[
                {
                  label: "Current value",
                  value: <span className="tnum text-h2">{live?.supply[0] ? formatUsdFull(live.supply[0].priceUsd) : "—"}</span>,
                },
                { label: "Price model", value: PRICE_MODEL_LABELS[asset.priceModel] },
                { label: "Computed by", value: entityName(ref.provider), source: ref.source },
                {
                  label: "Vault contract",
                  value: <AddressChip address={ref.address} chain={ref.chain} kind="contract" label={CHAINS[ref.chain].name} />,
                },
                { label: "Method", value: <span className="font-mono text-[12px]">{ref.method}</span> },
                { label: "Who can change it", value: VAULT_WRITER_LABELS[ref.writer], source: ref.source },
                { label: "Data comes from", value: ORIGIN_LABELS[ref.dataOrigin], source: ref.source },
                { label: "Expected cadence", value: "Every block (accrues continuously)" },
                { label: "History onchain", value: ref.historyOnchain ? "Yes" : "No" },
              ]}
            />
          ) : (
            <FactList
              facts={[
                {
                  label: "Current value",
                  value: <span className="tnum text-h2">{live?.oracle ? formatUsdFull(live.oracle.value) : "—"}</span>,
                },
                { label: "Price model", value: PRICE_MODEL_LABELS[asset.priceModel] },
                { label: "Provider", value: entityName(ref.provider), source: ref.source },
                {
                  label: "Feed contract",
                  value: ref.address ? (
                    <AddressChip address={ref.address} chain={ref.chain} kind="contract" label={CHAINS[ref.chain].name} />
                  ) : (
                    <span className="text-fg-muted">Not recorded yet</span>
                  ),
                },
                { label: "Who writes it", value: WRITER_LABELS[ref.writer], source: ref.source },
                { label: "Data comes from", value: ORIGIN_LABELS[ref.dataOrigin], source: ref.source },
                { label: "Expected cadence", value: `Every ${formatDuration(ref.cadenceSeconds)}` },
                { label: "History onchain", value: ref.historyOnchain ? "Yes" : "No" },
              ]}
            />
          )}
        </Card>

        <Card title="Oracle age" description="How long since the last onchain update, against the expected cadence.">
          {age && live?.oracle ? (
            <div className="space-y-4">
              <div className="flex items-baseline gap-3">
                <span className="tnum text-stat text-fg">{formatDuration(age.ageSeconds)}</span>
                <SliceDot
                  color={age.freshness === "on-schedule" ? "green" : age.freshness === "late" ? "yellow" : "red"}
                  label={<span className="text-small text-fg-muted">{age.freshness === "on-schedule" ? "On schedule" : age.freshness === "late" ? "Late" : "Stale"}</span>}
                />
              </div>
              <AgeGauge age={age} />
              <p className="text-small text-fg-muted">
                Last update {formatDateTime(live.oracle.updatedAt)}. Snapshot taken {formatDateTime(live.asOf)}.
              </p>
            </div>
          ) : (
            <p className="text-small text-fg-muted">No onchain oracle to measure.</p>
          )}
        </Card>
      </div>

      {live && (
        <Card
          title={`How DeFi markets price ${asset.ticker}`}
          description="A lending market that hardcodes $1 won't notice if the NAV drops."
        >
          <Table>
            <thead>
              <tr>
                <Th>Market</Th>
                <Th>Oracle</Th>
                <Th>Pricing method</Th>
              </tr>
            </thead>
            <tbody>
              {live.defiMarkets.map((m) => (
                <Tr key={m.marketId}>
                  <Td className="font-medium">
                    {PROTOCOL_LABELS[m.protocol]} · {m.name}
                  </Td>
                  <Td>
                    <AddressChip address={m.oracle.address} chain={m.chain} kind="contract" />
                  </Td>
                  <Td>
                    {m.oracle.type === "fixed" ? (
                      <Tag variant="risk-yellow">{m.oracle.description}</Tag>
                    ) : (
                      <Tag>{m.oracle.description}</Tag>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
