import { and, desc, eq } from "drizzle-orm";
import { erc20Abi, formatUnits, getAddress, parseAbi, type Address } from "viem";
import { getDb, schema } from "@/db/client";
import { clientsFor } from "@/discovery/rpc";
import type { Asset, Chain } from "@/lib/schema/asset";
import { readFeed } from "./oracles";
import { raiseAlert } from "../alerts";
import { fetchJson, log, publishedAssets } from "../util";

const CHAIN_PREFIX: Record<string, string> = { ethereum: "ethereum", arbitrum: "arbitrum", optimism: "optimism", base: "base", polygon: "polygon", avalanche: "avax", bsc: "bsc" };
const VAULT_ABI = parseAbi(["function asset() view returns (address)", "function convertToExitAssets(uint256) view returns (uint256)", "function convertToAssets(uint256) view returns (uint256)"]);

async function llamaPrice(chain: string, token: string): Promise<number | undefined> {
  const key = `${CHAIN_PREFIX[chain]}:${token}`;
  const res = await fetchJson<{ coins: Record<string, { price: number }> }>(`https://coins.llama.fi/prices/current/${key}`);
  return res.coins[key]?.price;
}

/** Underlying assets per share (exit rate, net of unrealized losses when the vault reports them) times the underlying's USD price. */
async function vaultPrice(chain: Chain, vault: Address, decimals: number): Promise<{ rate: number; priceUsd: number }> {
  const { client } = clientsFor(chain);
  const one = 10n ** BigInt(decimals);
  const underlying = await client.readContract({ address: vault, abi: VAULT_ABI, functionName: "asset" });
  const [assets, underlyingDecimals] = await Promise.all([
    client.readContract({ address: vault, abi: VAULT_ABI, functionName: "convertToExitAssets", args: [one] }).catch(() =>
      client.readContract({ address: vault, abi: VAULT_ABI, functionName: "convertToAssets", args: [one] }),
    ),
    client.readContract({ address: underlying, abi: erc20Abi, functionName: "decimals" }),
  ]);
  const rate = Number(formatUnits(assets, underlyingDecimals));
  const underlyingUsd = (await llamaPrice(chain, underlying).catch(() => undefined)) ?? 1;
  return { rate, priceUsd: rate * underlyingUsd };
}

async function previousRate(asset: Asset, chain: Chain): Promise<number | undefined> {
  const [row] = await getDb()
    .select()
    .from(schema.assetsSnapshot)
    .where(and(eq(schema.assetsSnapshot.assetSlug, asset.slug), eq(schema.assetsSnapshot.chain, chain)))
    .orderBy(desc(schema.assetsSnapshot.ts))
    .limit(1);
  const m = row?.source.match(/rate=([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

export async function supplyJob() {
  const now = new Date();
  for (const asset of await publishedAssets()) {
    for (const d of asset.deployments) {
      const { client } = clientsFor(d.chain);
      const token = getAddress(d.token);
      const [raw, decimals] = await Promise.all([
        client.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" }),
        client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
      ]);
      const totalSupply = Number(formatUnits(raw, decimals));

      const ref = asset.pricing.reference;
      let priceUsd: number | undefined;
      let source = "DefiLlama coins";
      // A NAV feed prices the same fund share on every chain.
      if (ref.type === "oracle" && ref.address) {
        priceUsd = (await readFeed({ ...ref, address: ref.address })).value;
        source = `${ref.provider} feed`;
      } else if (ref.type === "vault" && ref.chain === d.chain) {
        const v = await vaultPrice(d.chain, getAddress(ref.address), decimals);
        priceUsd = v.priceUsd;
        source = `vault exit rate rate=${v.rate}`;
        const before = await previousRate(asset, d.chain);
        // Accruing vaults only go up; any fall means losses were booked into the NAV.
        if (before !== undefined && v.rate < before) {
          await raiseAlert({
            id: `nav-drop-${asset.slug}-${d.chain}-${Math.floor(now.getTime() / 1000)}`,
            asset: asset.slug,
            severity: "high",
            kind: "nav-drop",
            title: `${asset.ticker} NAV per share fell ${(((before - v.rate) / before) * 100).toFixed(3)}% (${before} → ${v.rate})`,
            consequence: `The ${asset.ticker} contract now values each share lower, usually because a loan or strategy was impaired or defaulted. Lending markets that read this rate reprice collateral at once.`,
            chain: d.chain,
            contract: getAddress(ref.address),
          });
        }
      } else {
        priceUsd = await llamaPrice(d.chain, token);
      }

      await getDb().insert(schema.assetsSnapshot).values({ assetSlug: asset.slug, chain: d.chain, ts: now, totalSupply, priceUsd, source: `totalSupply() · ${source}` });
      log("supply", `${asset.slug}/${d.chain} supply=${totalSupply.toFixed(2)} price=${priceUsd}`);
    }
  }
}
