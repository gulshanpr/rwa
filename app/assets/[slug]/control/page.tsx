import { Info } from "lucide-react";
import { notFound } from "next/navigation";
import { AddressChip, type AddressKind } from "@/components/data/address-chip";
import { SourceMarker } from "@/components/data/source-marker";
import { ControlExplorer } from "@/components/permissions/control-explorer";
import { CategoryCard } from "@/components/risk/category-card";
import { RiskDot } from "@/components/risk/risk-dot";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Tag } from "@/components/ui/tag";
import { CHAINS } from "@/lib/chains";
import { formatDate, formatNumber } from "@/lib/format";
import { tabMetadata } from "@/lib/asset-meta";
import { POWER_LABELS } from "@/lib/framework/permissions";
import { buildControlGraph } from "@/lib/graph";
import { addressLabel, getProfile } from "@/lib/profile";
import { repoFileUrl } from "@/lib/site";
import { RISK_WORD } from "@/lib/ui";

export const generateMetadata = tabMetadata("Control");

const MECHANISM = { native: "Issued natively", "native+bridge": "Native, and a bridge can mint", bridged: "Bridged copy" } as const;

export default async function ControlPage({ params }: PageProps<"/assets/[slug]/control">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, powers, rating } = profile;
  const c = asset.control;

  return (
    <div className="grid gap-4">
      <CategoryCard result={rating.categories.control} slug={slug} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Audits and bug bounty">
          {c.audits.length === 0 ? (
            <p className="text-small text-fg-muted">No smart contract audit is published.</p>
          ) : (
            <ul className="divide-y divide-line">
              {[...c.audits]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((a) => (
                  <li key={`${a.auditor}-${a.date}`} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="text-small text-fg">
                      <span className="font-medium">{a.auditor}</span> · {a.scope}
                      <SourceMarker source={a.source} />
                    </span>
                    <span className="text-small whitespace-nowrap text-fg-muted">{formatDate(a.date)}</span>
                  </li>
                ))}
            </ul>
          )}
          <p className="mt-3 text-small text-fg-muted">
            {c.bugBounty.status === "public" ? (
              <>
                Bug bounty on {c.bugBounty.value.platform}, up to ${formatNumber(c.bugBounty.value.maxUsd)}.
                <SourceMarker source={c.bugBounty.source} />
              </>
            ) : (
              "No public bug bounty found."
            )}
          </p>
        </Card>
        <Card title="Chains and bridges" description="Holders on a bridged chain also depend on the bridge.">
          <ul className="divide-y divide-line">
            {c.chains.map((ch) => (
              <li key={ch.chain} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="text-small font-medium text-fg first-letter:uppercase">
                  {ch.chain}
                  <SourceMarker source={ch.source} />
                </span>
                <span className="text-right text-small text-fg-muted">
                  {MECHANISM[ch.mechanism]}
                  {ch.provider ? ` · ${ch.provider}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

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
                          <RiskDot
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
                For regulated securities, freeze and force-transfer powers are often legally required. Control rates who
                holds them and what checks exist, not whether they exist. A single key holding a critical power or freeze is
                red; a multisig with no timelock is yellow.
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
