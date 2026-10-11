import { notFound } from "next/navigation";
import { AddressChip } from "@/components/data/address-chip";
import { disclosedFact, FactList } from "@/components/data/fact-list";
import { SourceMarker } from "@/components/data/source-marker";
import { RiskList } from "@/components/risk/risk-list";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { tabMetadata } from "@/lib/asset-meta";
import { CHAINS } from "@/lib/chains";
import { formatPct, formatUsdFull } from "@/lib/format";
import { WHO_CAN_REDEEM_LABELS } from "@/lib/labels";
import { getProfile } from "@/lib/profile";

export const generateMetadata = tabMetadata("Exit");

const GATE_LABELS = {
  none: "No gates or suspension rights",
  "stated-limits": "Can be suspended, within stated limits",
  "issuer-discretion": "Can be suspended at issuer discretion",
} as const;

export default async function ExitPage({ params }: PageProps<"/assets/[slug]/exit">) {
  const { slug } = await params;
  const profile = getProfile(slug) ?? notFound();
  const { asset, score } = profile;
  const { redemption, instantLiquidity } = asset.exit;

  return (
    <div className="grid gap-4">
      <Card title="Exit findings" description={score.slices.exit.headline}>
        <RiskList reasons={score.slices.exit.reasons} slug={slug} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Redemption with the issuer">
          <FactList
            facts={[
              {
                label: "Redemption available",
                value: redemption.available.value ? "Yes" : "No",
                source: redemption.available.source,
              },
              {
                label: "Who can redeem",
                value: WHO_CAN_REDEEM_LABELS[redemption.whoCanRedeem.value],
                source: redemption.whoCanRedeem.source,
              },
              disclosedFact("Settlement", redemption.settlement),
              ...(redemption.minimum
                ? [
                    {
                      label: "Minimum redemption",
                      value: <span className="tnum">{formatUsdFull(redemption.minimum.value)}</span>,
                      source: redemption.minimum.source,
                    },
                  ]
                : []),
              disclosedFact("Gates or suspension", redemption.gatesOrSuspension, (v) => GATE_LABELS[v]),
            ]}
          />
        </Card>

        <Card title="Instant onchain exits" description="Ways out that don't wait for the issuer.">
          {instantLiquidity.length === 0 ? (
            <p className="text-small text-fg-muted">None found. Redemption goes through the issuer.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Path</Th>
                  <Th>Contract</Th>
                  <Th align="right">Depth</Th>
                </tr>
              </thead>
              <tbody>
                {instantLiquidity.map((l) => (
                  <Tr key={l.address}>
                    <Td>
                      <span className="font-medium">{l.label}</span>
                      <SourceMarker source={l.source} chain={l.chain} />
                      <p className="text-label font-normal text-fg-muted">
                        {l.type === "offramp-contract" ? "Redemption contract" : "DEX liquidity"} · {CHAINS[l.chain].name}
                      </p>
                    </Td>
                    <Td>
                      <AddressChip address={l.address} chain={l.chain} kind="contract" />
                    </Td>
                    <Td align="right">
                      {l.depthPctOfSupply !== undefined ? `${formatPct(l.depthPctOfSupply / 100)} of supply` : "—"}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
