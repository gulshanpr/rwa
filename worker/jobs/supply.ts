import { erc20Abi, formatUnits, getAddress } from "viem";
import { getDb, schema } from "@/db/client";
import { clientsFor } from "@/discovery/rpc";
import { loadAssets } from "@/lib/data";
import { readFeed } from "./oracles";
import { fetchJson, log } from "../util";

const CHAIN_PREFIX: Record<string, string> = { ethereum: "ethereum", arbitrum: "arbitrum", optimism: "optimism", base: "base", polygon: "polygon", avalanche: "avax" };

async function llamaPrice(chain: string, token: string): Promise<number | undefined> {
  const key = `${CHAIN_PREFIX[chain]}:${token}`;
  const res = await fetchJson<{ coins: Record<string, { price: number }> }>(`https://coins.llama.fi/prices/current/${key}`);
  return res.coins[key]?.price;
}

export async function supplyJob() {
  const now = new Date();
  for (const asset of loadAssets()) {
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
      if (ref.type === "oracle" && ref.address && ref.chain === d.chain) {
        priceUsd = (await readFeed(d.chain, ref.address)).value;
        source = `${ref.provider} feed`;
      } else {
        priceUsd = await llamaPrice(d.chain, token);
      }

      await getDb().insert(schema.assetsSnapshot).values({ assetSlug: asset.slug, chain: d.chain, ts: now, totalSupply, priceUsd, source: `totalSupply() · ${source}` });
      log("supply", `${asset.slug}/${d.chain} supply=${totalSupply.toFixed(2)} price=${priceUsd}`);
    }
  }
}
