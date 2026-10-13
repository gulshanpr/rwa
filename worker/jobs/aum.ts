import { getDb, schema } from "@/db/client";
import { fetchJson, log, publishedAssets } from "../util";

interface Stablecoin {
  tokens: { date: number; circulating: { peggedUSD?: number } }[];
}

// Fund-level AUM across every chain (we only track some deployments onchain).
// Upserts the full daily history so the 30-day change is always available.
export async function aumJob() {
  for (const asset of await publishedAssets()) {
    const id = asset.externalIds.defillamaStablecoin;
    if (!id) continue;
    const data = await fetchJson<Stablecoin>(`https://stablecoins.llama.fi/stablecoin/${id}`);
    const url = `https://defillama.com/stablecoin/${id}`;
    const rows = data.tokens
      .filter((t) => t.circulating.peggedUSD !== undefined)
      .map((t) => ({ assetSlug: asset.slug, chain: "all", ts: new Date(t.date * 1000), aumUsd: t.circulating.peggedUSD!, source: "DefiLlama", sourceUrl: url }));
    for (let i = 0; i < rows.length; i += 500) {
      await getDb().insert(schema.assetsSnapshot).values(rows.slice(i, i + 500)).onConflictDoNothing();
    }
    log("aum", `${asset.slug} ${rows.length} daily points, latest $${Math.round(rows.at(-1)?.aumUsd ?? 0).toLocaleString()}`);
  }
}
