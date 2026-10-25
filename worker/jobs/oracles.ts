import { getAddress, parseAbi, type Abi, type AbiFunction, type Address } from "viem";
import { getDb, schema } from "@/db/client";
import { clientsFor } from "@/discovery/rpc";
import type { Chain, PriceReference } from "@/lib/schema/asset";
import { formatDuration } from "@/lib/format";
import { feedAgeSeconds } from "@/lib/oracle";
import { raiseAlert } from "../alerts";
import { log, publishedAssets } from "../util";

const FEED_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);

type OracleRef = Extract<PriceReference, { type: "oracle" }>;

async function call(chain: Chain, address: Address, spec: NonNullable<OracleRef["read"]>["value"], prior: readonly unknown[] = []): Promise<readonly unknown[]> {
  const abi = parseAbi([spec.fn] as [string]) as Abi;
  const fn = abi[0] as AbiFunction;
  const args = spec.args.map((a, i) => {
    const ref = /^\$value\.(\d+)$/.exec(a);
    if (ref) return prior[Number(ref[1])];
    return /int/.test(fn.inputs[i]!.type) ? BigInt(a) : fn.inputs[i]!.type === "bool" ? a === "true" : a;
  });
  const out = await clientsFor(chain).client.readContract({ address, abi, functionName: fn.name, args });
  return fn.outputs.length > 1 ? (out as readonly unknown[]) : [out];
}

/** Reads a price feed: Chainlink-style by default, or with the asset's own `read` spec. */
export async function readFeed(ref: OracleRef & { address: string }) {
  const feed = getAddress(ref.address);
  if (ref.read) {
    const value = await call(ref.chain, feed, ref.read.value);
    const updatedAt = await call(ref.chain, feed, ref.read.updatedAt, value);
    const raw = value[ref.read.value.index] as bigint;
    return { value: Number(raw) / 10 ** ref.read.decimals, updatedAt: new Date(Number(updatedAt[ref.read.updatedAt.index]) * 1000), roundId: undefined };
  }
  const { client } = clientsFor(ref.chain);
  const [[roundId, answer, , updatedAt], decimals] = await Promise.all([
    client.readContract({ address: feed, abi: FEED_ABI, functionName: "latestRoundData" }),
    client.readContract({ address: feed, abi: FEED_ABI, functionName: "decimals" }),
  ]);
  return { value: Number(answer) / 10 ** decimals, updatedAt: new Date(Number(updatedAt) * 1000), roundId: roundId.toString() };
}

export async function oraclesJob() {
  const now = new Date();
  for (const asset of await publishedAssets()) {
    const ref = asset.pricing.reference;
    if (ref.type !== "oracle" || !ref.address) continue;
    const r = await readFeed({ ...ref, address: ref.address });
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

    if (feedAgeSeconds(ref, r.updatedAt, now) > 3 * ref.cadenceSeconds) {
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
