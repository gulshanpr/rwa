import { mkdirSync, writeFileSync } from "node:fs";
import { erc20Abi, formatUnits, getAddress, parseAbi, type Address } from "viem";
import { clientsFor } from "@/discovery/rpc";
import { loadAssets } from "@/lib/data";
import type { Asset, Chain } from "@/lib/schema/asset";
import { LiveSchema, type DefiMarket } from "@/lib/schema/live";
import { classifyFeed, classifyMorphoOracle } from "@/worker/jobs/defi-shared";
import { readFeed } from "@/worker/jobs/oracles";
import { fetchJson } from "@/worker/util";

const POOLS: Partial<Record<Chain, { name: string; pool: Address; market: string }[]>> = {
  ethereum: [
    { name: "Aave v3 Core", pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", market: "proto_mainnet_v3" },
    { name: "Aave Horizon", pool: "0xAe05Cd22df81871bc7cC2a04BeCfb516bFe332C8", market: "proto_horizon_v3" },
  ],
};
const POOL_ABI = parseAbi([
  "function getReservesList() view returns (address[])",
  "function ADDRESSES_PROVIDER() view returns (address)",
  "function getReserveData(address) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
]);
const PROVIDER_ABI = parseAbi(["function getPriceOracle() view returns (address)"]);
const ORACLE_ABI = parseAbi(["function getSourceOfAsset(address) view returns (address)", "function getAssetPrice(address) view returns (uint256)", "function BASE_CURRENCY_UNIT() view returns (uint256)"]);
const MORPHO = `query RwaCollateral($addresses: [String!]!, $chains: [Int!]!) {
  markets(first: 100, where: { collateralAssetAddress_in: $addresses, chainId_in: $chains }) {
    items { marketId lltv oracle { address } loanAsset { address symbol } collateralAsset { symbol }
      state { collateralAssetsUsd borrowAssetsUsd supplyAssetsUsd } }
  }
}`;

async function marketsFor(asset: Asset): Promise<DefiMarket[]> {
  const out: DefiMarket[] = [];
  for (const d of asset.deployments) {
    const chainId = clientsFor(d.chain).client.chain!.id;
    const res = await fetchJson<{ data?: { markets: { items: { marketId: string; lltv: string; oracle: { address: string } | null; loanAsset: { symbol: string }; collateralAsset: { symbol: string }; state: { collateralAssetsUsd: number | null; borrowAssetsUsd: number | null; supplyAssetsUsd: number | null } }[] } }; errors?: { message: string }[] }>("https://api.morpho.org/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: MORPHO, variables: { addresses: [d.token], chains: [chainId] } }),
    }).catch((e) => {
      console.error("morpho", asset.slug, d.chain, e instanceof Error ? e.message : e);
      return undefined;
    });
    if (res?.errors?.some((e) => /unsupported chainId/i.test(e.message))) continue;
    for (const m of res?.data?.markets.items ?? []) {
      const oracle = getAddress(m.oracle?.address ?? "0x0000000000000000000000000000000000000000");
      const classified = await classifyMorphoOracle(asset, d.chain, oracle);
      out.push({
        marketId: m.marketId,
        protocol: "morpho",
        name: `${m.collateralAsset.symbol} / ${m.loanAsset.symbol}`,
        chain: d.chain,
        loanAsset: m.loanAsset.symbol,
        lltv: Number(m.lltv) / 1e18,
        oracle: { address: oracle, type: classified.type, description: classified.description },
        collateralUsd: m.state.collateralAssetsUsd ?? 0,
        borrowUsd: m.state.borrowAssetsUsd ?? 0,
        supplyUsd: m.state.supplyAssetsUsd ?? 0,
        url: `https://app.morpho.org/${d.chain}/market/${m.marketId}`,
      });
    }

    const { client } = clientsFor(d.chain);
    const token = getAddress(d.token);
    for (const p of POOLS[d.chain] ?? []) {
      const reserves = await client.readContract({ address: p.pool, abi: POOL_ABI, functionName: "getReservesList" });
      if (!reserves.some((r) => r.toLowerCase() === token.toLowerCase())) continue;
      const reserve = await client.readContract({ address: p.pool, abi: POOL_ABI, functionName: "getReserveData", args: [token] });
      const provider = await client.readContract({ address: p.pool, abi: POOL_ABI, functionName: "ADDRESSES_PROVIDER" });
      const priceOracle = await client.readContract({ address: provider, abi: PROVIDER_ABI, functionName: "getPriceOracle" });
      const [source, price, unit, aSupply, debt, decimals] = await Promise.all([
        client.readContract({ address: priceOracle, abi: ORACLE_ABI, functionName: "getSourceOfAsset", args: [token] }),
        client.readContract({ address: priceOracle, abi: ORACLE_ABI, functionName: "getAssetPrice", args: [token] }),
        client.readContract({ address: priceOracle, abi: ORACLE_ABI, functionName: "BASE_CURRENCY_UNIT" }),
        client.readContract({ address: reserve.aTokenAddress, abi: erc20Abi, functionName: "totalSupply" }),
        client.readContract({ address: reserve.variableDebtTokenAddress, abi: erc20Abi, functionName: "totalSupply" }),
        client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
      ]);
      const usd = Number(price) / Number(unit);
      const suppliedUsd = Number(formatUnits(aSupply, decimals)) * usd;
      const lltv = Number((reserve.configuration >> 16n) & 0xffffn) / 10_000;
      const classified = await classifyFeed(asset, d.chain, getAddress(source));
      out.push({
        marketId: `${p.pool}:${token}`,
        protocol: "aave",
        name: `${p.name} · ${asset.ticker}`,
        chain: d.chain,
        loanAsset: "pool",
        lltv,
        oracle: {
          address: getAddress(source),
          type: classified.type,
          description: classified.description,
        },
        collateralUsd: suppliedUsd,
        borrowUsd: Number(formatUnits(debt, decimals)) * usd,
        supplyUsd: suppliedUsd,
        url: `https://app.aave.com/reserve-overview/?underlyingAsset=${token.toLowerCase()}&marketName=${p.market}`,
      });
    }
  }
  return out.filter((m) => m.collateralUsd >= 100);
}

const slugs = process.argv.slice(2);
const assets = loadAssets().filter((a) => slugs.includes(a.slug));
mkdirSync("data/live", { recursive: true });
for (const asset of assets) {
  const ref = asset.pricing.reference;
  if (ref.type !== "oracle" || !ref.address) throw new Error(`${asset.slug} has no oracle`);
  const reading = await readFeed({ ...ref, address: ref.address });
  const supply = [];
  for (const d of asset.deployments) {
    const { client } = clientsFor(d.chain);
    const token = getAddress(d.token);
    const [raw, decimals] = await Promise.all([
      client.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" }),
      client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    ]);
    supply.push({ chain: d.chain, totalSupply: Number(formatUnits(raw, decimals)), priceUsd: reading.value, source: `totalSupply() · ${ref.provider} feed` });
    console.error(asset.slug, d.chain, supply.at(-1));
  }
  const aum = supply.reduce((s, r) => s + r.totalSupply * r.priceUsd, 0);
  const defiMarkets = await marketsFor(asset);
  const live = LiveSchema.parse({
    asset: asset.slug,
    sample: false,
    asOf: new Date().toISOString(),
    supply,
    aum: { usd: aum, source: { name: "Onchain supply × price (tracked chains only)", url: "https://defillama.com" } },
    oracle: { chain: ref.chain, address: getAddress(ref.address), value: reading.value, updatedAt: reading.updatedAt.toISOString() },
    defiMarkets,
    defiSource: { name: "Morpho API, Aave pools onchain", url: "https://app.morpho.org" },
  });
  writeFileSync(`data/live/${asset.slug}.json`, JSON.stringify(live, null, 2) + "\n");
  console.error("wrote", asset.slug, "aum", Math.round(aum), "markets", defiMarkets.length);
}
process.exit(0);
