import { Info } from "lucide-react";
import { notFound } from "next/navigation";
import { AddressChip, type AddressKind } from "@/components/data/address-chip";
import { ControlExplorer } from "@/components/permissions/control-explorer";
import { RiskList } from "@/components/risk/risk-list";
import { SliceDot } from "@/components/risk/slice-dot";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Tag } from "@/components/ui/tag";
import { CHAINS } from "@/lib/chains";
import { formatDate, formatNumber } from "@/lib/format";
import { tabMetadata } from "@/lib/asset-meta";
import { buildControlGraph } from "@/lib/graph";
import { addressLabel, getProfile } from "@/lib/profile";
import { POWER_LABELS } from "@/lib/scoring/control";
import { repoFileUrl } from "@/lib/site";
import { RISK_WORD } from "@/lib/ui";

export const generateMetadata = tabMetadata("Control");

export default async function ControlPage({ params }: PageProps<"/assets/[slug]/control">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, powers, score } = profile;

  return (
    <div className="grid gap-4">
      <Card title="Control findings" description={score.slices.control.headline}>
        <RiskList reasons={score.slices.control.reasons} slug={slug} />
      </Card>

      {profile.snapshots.map((snapshot) => {
        const chain = snapshot.discovered.chain;
        const graph = buildControlGraph(profile, chain);
        const rows = powers.filter((r) => r.chain === chain);
        return (
          <div key={chain} className="grid gap-4">
            <ControlExplorer
              ticker={asset.ticker}
              chainName={CHAINS[chain].name}
              nodes={graph.nodes}
              edges={graph.edges}
              accounts={graph.accounts}
            />

            <Card title="Powers" description="Every privileged power we found, normalized to canonical power types.">
              <Table>
                <thead>
                  <tr>
                    <Th>Power</Th>
                    <Th>Criticality</Th>
                    <Th>Held by</Th>
                    <Th>Checks</Th>
                    <Th>Status</Th>
                    <Th>Found via</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const direct = r.holder.path[0];
                    return (
                      <Tr key={r.id} id={`power-${r.id}`}>
                        <Td className="font-medium whitespace-nowrap">{POWER_LABELS[r.power]}</Td>
                        <Td>
                          {r.criticality === "unclassified" ? (
                            <span className="text-fg-subtle">—</span>
                          ) : (
                            <Tag variant={r.criticality === "critical" ? "accent" : "neutral"}>
                              {r.criticality === "critical" ? "Critical" : "High"}
                            </Tag>
                          )}
                        </Td>
                        <Td>
                          <div className="flex flex-col items-start gap-1">
                            <AddressChip
                              address={direct.address}
                              chain={chain}
                              kind={direct.kind as AddressKind}
                              label={addressLabel(profile, direct.address) ?? direct.label}
                              detail={addressLabel(profile, direct.address) ? direct.label : undefined}
                            />
                            {r.holder.path.length > 1 && (
                              <span className="text-label font-normal text-fg-muted">
                                → {r.holder.path.slice(1).map((s) => s.label).join(" → ")}
                              </span>
                            )}
                          </div>
                        </Td>
                        <Td className="whitespace-nowrap text-fg-muted">{r.checks}</Td>
                        <Td>
                          <SliceDot
                            color={r.color}
                            label={<span className="text-fg-muted">{r.color === "grey" ? "Needs review" : RISK_WORD[r.color]}</span>}
                          />
                        </Td>
                        <Td>
                          <code className="font-mono text-[12px] text-fg-muted">{r.via}</code>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
              <p className="mt-3 flex items-start gap-2 text-small text-fg-muted">
                <Info className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
                For regulated securities, freeze and force-transfer powers are often legally required. This slice scores
                who holds them and what checks exist, not whether they exist.
              </p>
              <p className="mt-2 text-label font-normal text-fg-subtle">
                Discovered at block {formatNumber(snapshot.discovered.block)} · {formatDate(snapshot.discovered.timestamp)} ·
                tool {snapshot.meta.toolVersion} ·{" "}
                <a href={repoFileUrl(snapshot.path)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  View raw JSON on GitHub ↗
                </a>
              </p>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
