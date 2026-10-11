import { getAddress, parseAbi } from "viem";
import { getDb, schema } from "@/db/client";
import { clientsFor } from "@/discovery/rpc";
import { loadAssets } from "@/lib/data";
import type { Chain } from "@/lib/schema/asset";
import { formatDuration } from "@/lib/format";
import { raiseAlert } from "../alerts";
import { log } from "../util";

const FEED_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);

export async function readFeed(chain: Chain, address: string) {
  const { client } = clientsFor(chain);
  const feed = getAddress(address);
  const [[roundId, answer, , updatedAt], decimals] = await Promise.all([
    client.readContract({ address: feed, abi: FEED_ABI, functionName: "latestRoundData" }),
    client.readContract({ address: feed, abi: FEED_ABI, functionName: "decimals" }),
  ]);
  return { value: Number(answer) / 10 ** decimals, updatedAt: new Date(Number(updatedAt) * 1000), roundId: roundId.toString() };
}

export async function oraclesJob() {
  const now = new Date();
  for (const asset of loadAssets()) {
    const ref = asset.pricing.reference;
    if (ref.type !== "oracle" || !ref.address) continue;
    const r = await readFeed(ref.chain, ref.address);
    const ageSeconds = Math.round((now.getTime() - r.updatedAt.getTime()) / 1000);
    await getDb().insert(schema.oracleReading).values({
      assetSlug: asset.slug,
      chain: ref.chain,
      feed: getAddress(ref.address),
      ts: now,
      value: r.value,
      updatedAtOnchain: r.updatedAt,
      ageSeconds,
      roundId: r.roundId,
    });
    log("oracles", `${asset.slug} value=${r.value} age=${formatDuration(ageSeconds)}`);

    if (ageSeconds > 3 * ref.cadenceSeconds) {
      await raiseAlert({
        // One alert per stale update: the id is keyed on the last onchain update time.
        id: `oracle-stale-${asset.slug}-${r.updatedAt.getTime() / 1000}`,
        asset: asset.slug,
        severity: "high",
        kind: "oracle-stale",
        title: `${asset.ticker} onchain price hasn't updated in ${formatDuration(ageSeconds)}`,
        consequence: `The ${ref.provider} feed normally updates every ${formatDuration(ref.cadenceSeconds)}. Lending markets that read it may misprice ${asset.ticker}.`,
        chain: ref.chain,
        contract: getAddress(ref.address),
      });
    }
  }
}
