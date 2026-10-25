import { notFound } from "next/navigation";
import { AddressChip } from "@/components/data/address-chip";
import { disclosedFact, FactList } from "@/components/data/fact-list";
import { SourceMarker } from "@/components/data/source-marker";
import { CategoryCard } from "@/components/risk/category-card";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { tabMetadata } from "@/lib/asset-meta";
import { formatDateTime, formatUsd, formatUsdFull } from "@/lib/format";
import { hasMarket, MARKET_MAX_SLIPPAGE_PCT, MAX_SLIPPAGE_PCT, REAL_LIQUIDITY_USD } from "@/lib/framework/exit";
import { WHO_CAN_REDEEM_LABELS } from "@/lib/labels";
import { getProfile } from "@/lib/profile";

export const generateMetadata = tabMetadata("Exit");

const GATE_LABELS = {
  none: "No gates or suspension rights",
  "stated-limits": "Can be suspended, within stated limits",
  "issuer-discretion": "Can be suspended at issuer discretion",
} as const;

const DEALING_LABELS = { continuous: "Any time", daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly" } as const;
const LIQUIDATOR_LABELS = { anyone: "Anyone", allowlisted: "Allowlisted wallets only", none: "No" } as const;

export default async function ExitPage({ params }: PageProps<"/assets/[slug]/exit">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, rating, measured } = profile;
  const x = asset.exit;
  const r = x.redemption;

  return (
    <div className="grid gap-4">
      <CategoryCard result={rating.categories.exit} slug={slug} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Redemption with the issuer">
          <FactList
            facts={[
              { label: "Redemption available", value: r.available.value ? "Yes" : "No", source: r.available.source },
              { label: "Who can redeem", value: WHO_CAN_REDEEM_LABELS[r.whoCanRedeem.value], source: r.whoCanRedeem.source },
              { label: "Dealing", value: DEALING_LABELS[x.dealing.value], source: x.dealing.source },
              disclosedFact("Settlement", r.settlement),
              disclosedFact("Notice period", x.noticeDays, (v) => (v === 0 ? "None" : `${v} days`)),
              disclosedFact("Lock-up", x.lockupDays, (v) => (v === 0 ? "None" : `${v} days`)),
              disclosedFact("Gates or suspension", r.gatesOrSuspension, (v) => GATE_LABELS[v]),
              disclosedFact("Daily cap", x.dailyCapUsd, (v) => (v === null ? "None" : formatUsd(v))),
              disclosedFact("Minimum", x.minimumUsd, (v) => <span className="tnum">{formatUsdFull(v)}</span>),
              disclosedFact("Fee", x.feeBps, (v) => `${v / 100}%`),
            ]}
          />
        </Card>

        <div className="grid content-start gap-4">
          <Card title="Liquidators" description="In a lending market, the real exit window is how fast a liquidator can get out.">
            <FactList facts={[{ label: "Can hold the token", value: LIQUIDATOR_LABELS[x.liquidators.value], source: x.liquidators.source }]} />
          </Card>
          <Card title="Holder concentration">
            {measured?.holders ? (
              <>
                <p className="text-small text-fg-muted">
                  The top 10 wallets on Ethereum hold <span className="tnum font-medium text-fg">{measured.holders.top10Pct.toFixed(1)}%</span> of supply
                  {measured.holders.count ? ` (${measured.holders.count} holders)` : ""}.
                </p>
                <ul className="mt-3 divide-y divide-line">
                  {measured.holders.top.slice(0, 5).map((h) => (
                    <li key={h.address} className="flex items-center justify-between gap-3 py-1.5">
                      <AddressChip address={h.address} chain={measured.holders!.chain} kind={h.isContract ? "contract" : "eoa"} label={h.name} />
                      <span className="tnum text-small text-fg-muted">{h.pct.toFixed(2)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-small text-fg-muted">Not measured yet.</p>
            )}
          </Card>
        </div>
      </div>

      <Card title="Instant exits" description={`Ways out that don't wait for redemption. Real liquidity means ${formatUsd(REAL_LIQUIDITY_USD)} out at once.`}>
        <p className="mb-2 text-label text-fg-subtle">Instant redemption facilities</p>
        {x.instant.length === 0 ? (
          <p className="text-small text-fg-muted">None found.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Facility</Th>
                <Th>Contract</Th>
                <Th align="right">Daily cap</Th>
                <Th align="right">Can pay now</Th>
                <Th align="right">Fee</Th>
              </tr>
            </thead>
            <tbody>
              {x.instant.map((f) => (
                <Tr key={f.label}>
                  <Td className="font-medium">{f.label}</Td>
                  <Td>{f.address && f.chain ? <AddressChip address={f.address} chain={f.chain} kind="contract" /> : <span className="text-fg-subtle">—</span>}</Td>
                  <Td align="right">
                    {f.dailyCapUsd.status === "public" ? (
                      <>
                        {formatUsd(f.dailyCapUsd.value)}
                        <SourceMarker source={f.dailyCapUsd.source} />
                      </>
                    ) : (
                      <span className="text-fg-subtle">Not public</span>
                    )}
                  </Td>
                  <Td align="right">
                    {f.fundedUsd.status === "public" ? (
                      <>
                        {formatUsd(f.fundedUsd.value)}
                        <SourceMarker source={f.fundedUsd.source} />
                      </>
                    ) : (
                      <span className="text-fg-subtle">Not public</span>
                    )}
                  </Td>
                  <Td align="right">{f.feeBps !== undefined ? `${f.feeBps / 100}%` : "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}

        <p className="mt-5 mb-2 text-label text-fg-subtle">Selling on DEXs into USDC</p>
        {measured ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Sell</Th>
                  <Th align="right">You get</Th>
                  <Th align="right">Loss against NAV</Th>
                </tr>
              </thead>
              <tbody>
                {measured.dex.quotes.map((q) => (
                  <Tr key={q.sizeUsd}>
                    <Td className="font-medium">{formatUsd(q.sizeUsd)}</Td>
                    <Td align="right">{q.routed && q.outUsd !== undefined ? formatUsd(q.outUsd) : "No route"}</Td>
                    <Td align="right">
                      {!q.routed || q.slippagePct === undefined ? (
                        "—"
                      ) : q.slippagePct >= MARKET_MAX_SLIPPAGE_PCT ? (
                        <span className="text-fg-muted">
                          {q.slippagePct.toFixed(2)}% ({hasMarket(measured) ? "not enough depth" : "dust pools only"})
                        </span>
                      ) : (
                        <span className={q.slippagePct <= MAX_SLIPPAGE_PCT ? "text-fg" : "text-fg-muted"}>{q.slippagePct.toFixed(2)}%</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <p className="mt-2 text-label font-normal text-fg-subtle">
              Quoted {formatDateTime(measured.asOf)} at NAV {formatUsdFull(measured.dex.navUsd)}, via{" "}
              <a href={measured.dex.source} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                KyberSwap
              </a>
              .
            </p>
          </>
        ) : (
          <p className="text-small text-fg-muted">Not measured yet.</p>
        )}
      </Card>
    </div>
  );
}
