import { erc20Abi, formatUnits, getAddress, parseAbi, type Address } from "viem";
import { getDb, schema } from "@/db/client";
import { clientsFor } from "@/discovery/rpc";
import type { Chain } from "@/lib/schema/asset";
import { classifyFeed } from "./defi-shared";
import { log, publishedAssets, setCursor } from "../util";

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
const ORACLE_ABI = parseAbi([
  "function getSourceOfAsset(address) view returns (address)",
  "function getAssetPrice(address) view returns (uint256)",
  "function BASE_CURRENCY_UNIT() view returns (uint256)",
]);

export async function aaveJob() {
  const now = new Date();
  for (const asset of await publishedAssets()) {
    for (const d of asset.deployments) {
      const { client } = clientsFor(d.chain);
      const token = getAddress(d.token);
      for (const p of POOLS[d.chain] ?? []) {
        const reserves = await client.readContract({ address: p.pool, abi: POOL_ABI, functionName: "getReservesList" });
        if (!reserves.some((r) => r.toLowerCase() === token.toLowerCase())) {
          log("aave", `${asset.slug}/${d.chain} not listed on ${p.name}`);
          continue;
        }
        const reserve = await client.readContract({
          address: p.pool,
          abi: POOL_ABI,
          functionName: "getReserveData",
          args: [token],
        });
        const provider = await client.readContract({
          address: p.pool,
          abi: POOL_ABI,
          functionName: "ADDRESSES_PROVIDER",
        });
        const priceOracle = await client.readContract({
          address: provider,
          abi: PROVIDER_ABI,
          functionName: "getPriceOracle",
        });
        const [source, price, unit, aSupply, debt, decimals] = await Promise.all([
          client.readContract({
            address: priceOracle,
            abi: ORACLE_ABI,
            functionName: "getSourceOfAsset",
            args: [token],
          }),
          client.readContract({ address: priceOracle, abi: ORACLE_ABI, functionName: "getAssetPrice", args: [token] }),
          client.readContract({ address: priceOracle, abi: ORACLE_ABI, functionName: "BASE_CURRENCY_UNIT" }),
          client.readContract({ address: reserve.aTokenAddress, abi: erc20Abi, functionName: "totalSupply" }),
          client.readContract({
            address: reserve.variableDebtTokenAddress,
            abi: erc20Abi,
            functionName: "totalSupply",
          }),
          client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
        ]);
        const usd = Number(price) / Number(unit);
        const suppliedUsd = Number(formatUnits(aSupply, decimals)) * usd;
        // Liquidation threshold is bits 16-31 of the reserve configuration, in basis points.
        const lltv = Number((reserve.configuration >> 16n) & 0xffffn) / 10_000;
        const oracle = await classifyFeed(asset, d.chain, source);
        await getDb()
          .insert(schema.defiMarket)
          .values({
            assetSlug: asset.slug,
            marketId: `${p.pool}:${token}`,
            protocol: "aave",
            chain: d.chain,
            name: `${p.name} · ${asset.ticker}`,
            collateralAsset: token,
            loanAsset: "pool",
            lltv,
            oracleAddress: getAddress(source),
            oracleType: oracle.type,
            oracleDescription: oracle.description,
            url: `https://app.aave.com/reserve-overview/?underlyingAsset=${token.toLowerCase()}&marketName=${p.market}`,
            collateralUsd: suppliedUsd,
            borrowUsd: Number(formatUnits(debt, decimals)) * usd,
            supplyUsd: suppliedUsd,
            ts: now,
          });
        log(
          "aave",
          `${asset.slug}/${d.chain} listed on ${p.name}, supplied $${Math.round(suppliedUsd).toLocaleString()}`,
        );
      }
    }
    await setCursor(`defi:aave:${asset.slug}`, now.toISOString());
  }
}
