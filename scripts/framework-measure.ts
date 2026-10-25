import { mkdirSync, writeFileSync } from "node:fs";
import { loadAssets, loadLive } from "@/lib/data";
import { MeasuredSchema, type Measured } from "@/lib/framework/schema";
import { fetchJson } from "@/worker/util";

// Measures what the framework's Exit category needs from the market: the top-10 holder share and DEX
// sells of $1M / $5M / $10M into USDC, against NAV. Ethereum only for now.
// Usage: bun framework:measure [slug ...]

const SIZES = [1_000_000, 5_000_000, 10_000_000];
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const BLOCKSCOUT = "https://eth.blockscout.com/api/v2";
const KYBER = "https://aggregator-api.kyberswap.com/ethereum/api/v1/routes";

interface TokenInfo {
  decimals: string;
  total_supply: string;
  holders_count?: string;
}
interface Holders {
  items: { address: { hash: string; name: string | null; is_contract: boolean }; value: string }[];
}
interface Route {
  code: number;
  data?: { routeSummary?: { amountOut: string } };
}

const units = (raw: string, decimals: number) => Number(BigInt(raw)) / 10 ** decimals;

async function measure(slug: string, token: string, navUsd: number): Promise<Measured> {
  const info = await fetchJson<TokenInfo>(`${BLOCKSCOUT}/tokens/${token}`);
  const decimals = Number(info.decimals);
  const supply = units(info.total_supply, decimals);
  const holders = await fetchJson<Holders>(`${BLOCKSCOUT}/tokens/${token}/holders`);
  const top = holders.items.slice(0, 10).map((h) => ({
    address: h.address.hash,
    ...(h.address.name ? { name: h.address.name } : {}),
    isContract: h.address.is_contract,
    pct: Math.round((units(h.value, decimals) / supply) * 10000) / 100,
  }));

  const quotes: Measured["dex"]["quotes"] = [];
  for (const sizeUsd of SIZES) {
    const amountIn = BigInt(Math.floor((sizeUsd / navUsd) * 10 ** Math.min(decimals, 12))) * 10n ** BigInt(Math.max(0, decimals - 12));
    const route = await fetchJson<Route>(`${KYBER}?tokenIn=${token}&tokenOut=${USDC}&amountIn=${amountIn}`, { headers: { "x-client-id": "rwabeat" } }, 1).catch(() => undefined);
    const out = route?.code === 0 ? route.data?.routeSummary?.amountOut : undefined;
    if (!out) quotes.push({ sizeUsd, routed: false });
    else {
      const outUsd = units(out, 6);
      quotes.push({ sizeUsd, routed: true, outUsd: Math.round(outUsd), slippagePct: Math.round((1 - outUsd / sizeUsd) * 10000) / 100 });
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  return MeasuredSchema.parse({
    asset: slug,
    asOf: new Date().toISOString(),
    holders: {
      chain: "ethereum",
      ...(info.holders_count ? { count: Number(info.holders_count) } : {}),
      top10Pct: Math.round(top.reduce((s, h) => s + h.pct, 0) * 100) / 100,
      top,
      source: `https://eth.blockscout.com/token/${token}?tab=holders`,
    },
    dex: { chain: "ethereum", navUsd, quotes, source: "https://kyberswap.com" },
  });
}

const only = process.argv.slice(2);
mkdirSync("data/framework/measured", { recursive: true });
for (const asset of loadAssets().filter((a) => only.length === 0 || only.includes(a.slug))) {
  const d = asset.deployments.find((x) => x.chain === "ethereum");
  const nav = loadLive(asset.slug)?.supply.find((s) => s.chain === "ethereum")?.priceUsd;
  if (!d || !nav) {
    console.log(`${asset.slug}: skipped (no Ethereum deployment or live price)`);
    continue;
  }
  const m = await measure(asset.slug, d.token, nav);
  writeFileSync(`data/framework/measured/${asset.slug}.json`, `${JSON.stringify(m, null, 2)}\n`);
  const q = m.dex.quotes.map((x) => (x.routed ? `$${x.sizeUsd / 1e6}M ${x.slippagePct}%` : `$${x.sizeUsd / 1e6}M no route`)).join(", ");
  console.log(`${asset.slug}: top10 ${m.holders?.top10Pct}% · ${q}`);
}
