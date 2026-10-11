import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { Donut } from "@/components/charts/donut";
import { AddressChip } from "@/components/data/address-chip";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Tag } from "@/components/ui/tag";
import { tabMetadata } from "@/lib/asset-meta";
import { CHAINS } from "@/lib/chains";
import { formatDateTime, formatPct, formatUsd, formatUsdFull } from "@/lib/format";
import { PROTOCOL_LABELS } from "@/lib/labels";
import { getProfile } from "@/lib/profile";

export const generateMetadata = tabMetadata("DeFi exposure");

export default async function DefiPage({ params }: PageProps<"/assets/[slug]/defi">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, live, stats } = profile;
  const markets = live?.defiMarkets ?? [];

  const byProtocol = Object.entries(
    markets.reduce<Record<string, number>>((acc, m) => {
      acc[PROTOCOL_LABELS[m.protocol]] = (acc[PROTOCOL_LABELS[m.protocol]] ?? 0) + m.collateralUsd;
      return acc;
    }, {}),
  ).map(([label, value]) => ({ label, value }));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card
        id="markets"
        title="Lending markets"
        description={`Where ${asset.ticker} is accepted as collateral, and how each market prices it.`}
        className="lg:row-span-2"
      >
        {markets.length === 0 ? (
          <p className="text-small text-fg-muted">Not used as collateral in any tracked market.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Market</Th>
                <Th align="right">LLTV</Th>
                <Th>Oracle</Th>
                <Th align="right">Collateral</Th>
                <Th align="right">Borrowed</Th>
                <Th align="right">Util.</Th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => (
                <Tr key={m.marketId}>
                  <Td>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-fg hover:text-accent"
                    >
                      {PROTOCOL_LABELS[m.protocol]} · {m.name}
                      <ExternalLink className="size-3 text-fg-subtle" />
                    </a>
                    <p className="text-label font-normal text-fg-muted">
                      {CHAINS[m.chain].name} · borrow {m.loanAsset}
                    </p>
                  </Td>
                  <Td align="right">{formatPct(m.lltv)}</Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      {m.oracle.type === "fixed" ? (
                        <Tag variant="risk-yellow" title="Hardcoded price: the market won't react if the NAV changes">
                          Hardcoded $1
                        </Tag>
                      ) : (
                        <Tag>{m.oracle.type === "nav-feed" ? "NAV feed" : "Market price"}</Tag>
                      )}
                      <AddressChip address={m.oracle.address} chain={m.chain} kind="contract" />
                    </div>
                  </Td>
                  <Td align="right">
                    <span title={formatUsdFull(m.collateralUsd)}>{formatUsd(m.collateralUsd)}</span>
                  </Td>
                  <Td align="right">
                    <span title={formatUsdFull(m.borrowUsd)}>{formatUsd(m.borrowUsd)}</span>
                  </Td>
                  <Td align="right">{m.supplyUsd ? formatPct(m.borrowUsd / m.supplyUsd) : "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {live && (
          <p className="mt-3 text-label font-normal text-fg-subtle">
            Source:{" "}
            <a href={live.defiSource.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              {live.defiSource.name}
            </a>{" "}
            · snapshot {formatDateTime(live.asOf)}
          </p>
        )}
      </Card>

      <Card title="Collateral by protocol">
        <Donut data={byProtocol} label={`${asset.ticker} collateral by protocol`} />
      </Card>
      <Card title="Totals">
        <dl className="tnum grid grid-cols-2 gap-3">
          <div>
            <dt className="text-label text-fg-subtle">Collateral</dt>
            <dd className="text-h2">{formatUsd(stats.defiCollateralUsd)}</dd>
          </div>
          <div>
            <dt className="text-label text-fg-subtle">Borrowed against it</dt>
            <dd className="text-h2">{formatUsd(stats.defiBorrowUsd)}</dd>
          </div>
          <div>
            <dt className="text-label text-fg-subtle">Markets</dt>
            <dd className="text-h2">{stats.defiMarkets}</dd>
          </div>
          <div>
            <dt className="text-label text-fg-subtle">Share of supply</dt>
            <dd className="text-h2">{stats.aumUsd ? formatPct(stats.defiCollateralUsd / stats.aumUsd) : "—"}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
