import { getAddress } from "viem";
import { getDb, schema } from "@/db/client";
import { clientsFor } from "@/discovery/rpc";
import { classifyMorphoOracle } from "./defi-shared";
import { fetchJson, log, publishedAssets, setCursor } from "../util";

interface MorphoMarket {
  marketId: string;
  lltv: string;
  oracle: { address: string } | null;
  loanAsset: { address: string; symbol: string };
  collateralAsset: { symbol: string };
  state: { collateralAssetsUsd: number | null; borrowAssetsUsd: number | null; supplyAssetsUsd: number | null };
}

const QUERY = `query RwaCollateral($addresses: [String!]!, $chains: [Int!]!) {
  markets(first: 100, where: { collateralAssetAddress_in: $addresses, chainId_in: $chains }) {
    items {
      marketId lltv
      oracle { address }
      loanAsset { address symbol }
      collateralAsset { symbol }
      state { collateralAssetsUsd borrowAssetsUsd supplyAssetsUsd }
    }
  }
}`;

export async function morphoJob() {
  const now = new Date();
  for (const asset of await publishedAssets()) {
    for (const d of asset.deployments) {
      const chainId = clientsFor(d.chain).client.chain!.id;
      const res = await fetchJson<{ data?: { markets: { items: MorphoMarket[] } }; errors?: { message: string }[] }>("https://api.morpho.org/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: QUERY, variables: { addresses: [d.token], chains: [chainId] } }),
      });
      if (res.errors?.some((e) => /unsupported chainId/i.test(e.message))) {
        log("morpho", `${asset.slug}/${d.chain} skipped: Morpho doesn't index this chain`);
        continue;
      }
      if (res.errors?.length) throw new Error(`Morpho API: ${res.errors[0]!.message}`);
      const markets = res.data?.markets.items ?? [];
      for (const m of markets) {
        const oracleAddress = getAddress(m.oracle?.address ?? "0x0000000000000000000000000000000000000000");
        const oracle = await classifyMorphoOracle(asset, d.chain, oracleAddress);
        await getDb().insert(schema.defiMarket).values({
          assetSlug: asset.slug,
          marketId: m.marketId,
          protocol: "morpho",
          chain: d.chain,
          name: `${m.collateralAsset.symbol} / ${m.loanAsset.symbol}`,
          collateralAsset: getAddress(d.token),
          loanAsset: m.loanAsset.symbol,
          lltv: Number(m.lltv) / 1e18,
          oracleAddress,
          oracleType: oracle.type,
          oracleDescription: oracle.description,
          url: `https://app.morpho.org/${d.chain}/market/${m.marketId}`,
          collateralUsd: m.state.collateralAssetsUsd ?? 0,
          borrowUsd: m.state.borrowAssetsUsd ?? 0,
          supplyUsd: m.state.supplyAssetsUsd ?? 0,
          ts: now,
        });
      }
      log("morpho", `${asset.slug}/${d.chain} ${markets.length} market(s)`);
    }
    await setCursor(`defi:morpho:${asset.slug}`, now.toISOString());
  }
}
