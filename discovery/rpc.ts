import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  decodeEventLog,
  fallback,
  http,
  toEventSelector,
  type AbiEvent,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";
import { arbitrum, avalanche, base, bsc, mainnet, optimism, polygon } from "viem/chains";
import type { Chain } from "@/lib/schema/asset";

const VIEM_CHAINS = { ethereum: mainnet, arbitrum, optimism, base, polygon, avalanche, bsc } as const;

const DEFAULT_RPCS: Record<Chain, string[]> = {
  ethereum: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"],
  // PublicNode and dRPC free tiers only serve eth_getLogs for the last ~100 Arbitrum blocks (~25s); the official RPC serves history.
  arbitrum: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com", "https://arbitrum.drpc.org"],
  optimism: ["https://optimism-rpc.publicnode.com", "https://optimism.drpc.org"],
  base: ["https://base-rpc.publicnode.com", "https://base.drpc.org"],
  polygon: ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"],
  avalanche: ["https://avalanche-c-chain-rpc.publicnode.com", "https://avalanche.drpc.org"],
  bsc: ["https://bsc-rpc.publicnode.com", "https://bsc.drpc.org"],
};

/** Free public endpoints that serve history. dRPC's free plan rejects eth_getLogs ranges near 10,000 blocks. */
const DEFAULT_ARCHIVE_RPCS: Record<Chain, string> = {
  ethereum: "https://eth.drpc.org",
  arbitrum: "https://arbitrum.drpc.org",
  optimism: "https://optimism.drpc.org",
  base: "https://base.drpc.org",
  polygon: "https://polygon.drpc.org",
  avalanche: "https://avalanche.drpc.org",
  bsc: "https://bsc.drpc.org",
};

function envList(name: string): string[] | undefined {
  const v = process.env[name];
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
}

export interface ChainClients {
  chain: Chain;
  chainId: number;
  client: PublicClient;
  archive: PublicClient;
  logChunk: bigint;
}

const cache = new Map<Chain, ChainClients>();

export function clientsFor(chain: Chain): ChainClients {
  const hit = cache.get(chain);
  if (hit) return hit;
  const key = chain.toUpperCase();
  const viemChain = VIEM_CHAINS[chain];
  const urls = [...new Set([...(envList(`RPC_URL_${key}`) ?? []), ...DEFAULT_RPCS[chain]])];
  const archiveUrl = process.env[`ARCHIVE_RPC_URL_${key}`] ?? DEFAULT_ARCHIVE_RPCS[chain];
  // No JSON-RPC batching: Infura answers rate-limited batches with a bare error object
  // that viem reads as an empty result instead of an error, so fallback never triggers.
  const transport = (u: string) => http(u, { retryCount: 4, retryDelay: 500, timeout: 30_000 });
  const client = createPublicClient({ chain: viemChain, transport: fallback(urls.map(transport)) }) as PublicClient;
  const result: ChainClients = {
    chain,
    chainId: viemChain.id,
    client,
    archive: createPublicClient({ chain: viemChain, transport: transport(archiveUrl) }) as PublicClient,
    logChunk: BigInt(process.env[`LOG_CHUNK_${key}`] ?? 9_000),
  };
  cache.set(chain, result);
  return result;
}

export const CACHE_DIR = path.join(process.cwd(), ".cache");

function readCache<T>(rel: string): T | undefined {
  const file = path.join(CACHE_DIR, rel);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : undefined;
}

function writeCache(rel: string, value: unknown) {
  const file = path.join(CACHE_DIR, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
}

/** Binary-searches the first block where `address` has code. Cached forever. */
export async function deploymentBlock(c: ChainClients, address: Address, latest: bigint): Promise<bigint> {
  const rel = `deploy/${c.chainId}/${address.toLowerCase()}.json`;
  const hit = readCache<{ block: string }>(rel);
  if (hit) return BigInt(hit.block);
  let lo = 0n;
  let hi = latest;
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    const code = await c.archive.getCode({ address, blockNumber: mid });
    if (code && code !== "0x") hi = mid;
    else lo = mid;
  }
  writeCache(rel, { block: hi.toString() });
  return hi;
}

export interface CachedLog {
  blockNumber: string;
  transactionHash: string;
  logIndex: number;
  args: Record<string, unknown>;
}

const LOG_APIS: Partial<Record<Chain, string>> = {
  ethereum: "https://eth.blockscout.com/api",
  arbitrum: "https://arbitrum.blockscout.com/api",
  optimism: "https://optimism.blockscout.com/api",
  base: "https://base.blockscout.com/api",
  polygon: "https://polygon.blockscout.com/api",
};

interface ExplorerLog {
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
  data: Hex;
  topics: (Hex | null)[];
}

/** Etherscan-compatible `getLogs` (Blockscout without a key, or Etherscan V2 with ETHERSCAN_API_KEY). Pages by block. */
async function explorerLogs(c: ChainClients, address: Address, event: AbiEvent, fromBlock: bigint, toBlock: bigint): Promise<CachedLog[] | undefined> {
  const custom = process.env[`LOGS_API_${c.chain.toUpperCase()}`];
  const key = process.env.ETHERSCAN_API_KEY;
  const base = custom ?? (key ? `https://api.etherscan.io/v2/api?chainid=${c.chainId}&apikey=${key}&` : LOG_APIS[c.chain] ? `${LOG_APIS[c.chain]}?` : undefined);
  if (!base) return undefined;
  const sep = base.endsWith("?") || base.endsWith("&") ? "" : base.includes("?") ? "&" : "?";
  const topic0 = toEventSelector(event);
  const out = new Map<string, CachedLog>();
  let from = fromBlock;
  for (;;) {
    const url = `${base}${sep}module=logs&action=getLogs&address=${address}&topic0=${topic0}&fromBlock=${from}&toBlock=${toBlock}`;
    const d = await withRetry(async () => {
      const res = await fetch(url, { headers: { "user-agent": "rwabeat" } });
      if (!res.ok) throw new Error(`log API ${res.status}`);
      const j = (await res.json()) as { status: string; message: string; result: ExplorerLog[] | string };
      if (j.status !== "1" && !/no records|no logs/i.test(j.message)) throw new Error(`log API: ${j.message} ${typeof j.result === "string" ? j.result : ""}`);
      return Array.isArray(j.result) ? j.result : [];
    });
    for (const l of d) {
      const decoded = decodeEventLog({ abi: [event], data: l.data, topics: l.topics.filter((t): t is Hex => Boolean(t)) as [Hex, ...Hex[]] });
      const log: CachedLog = {
        blockNumber: BigInt(l.blockNumber).toString(),
        transactionHash: l.transactionHash,
        logIndex: Number(BigInt(l.logIndex === "0x" ? "0x0" : l.logIndex)),
        args: decoded.args as Record<string, unknown>,
      };
      out.set(`${log.transactionHash}-${log.logIndex}`, log);
    }
    if (d.length < 1000) break;
    const last = BigInt(d[d.length - 1].blockNumber);
    if (last <= from) break;
    from = last;
  }
  return [...out.values()];
}

/**
 * Fetches every `event` log from `address` between `fromBlock` and `toBlock`.
 * Uses an explorer log API when one is configured, else chunked eth_getLogs on the archive RPC.
 * Results are cached per (address, event) with the last scanned block, so later runs only scan new blocks.
 */
export async function scanLogs(
  c: ChainClients,
  address: Address,
  event: AbiEvent,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<CachedLog[]> {
  const rel = `logs/${c.chainId}/${address.toLowerCase()}-${event.name}.json`;
  const hit = readCache<{ scannedTo: string; logs: CachedLog[] }>(rel);
  if (hit && BigInt(hit.scannedTo) >= toBlock) return hit.logs.filter((l) => BigInt(l.blockNumber) <= toBlock);
  const logs = hit?.logs ?? [];
  let start = hit ? BigInt(hit.scannedTo) + 1n : fromBlock;
  {
    const fromApi = await explorerLogs(c, address, event, start, toBlock).catch((e) => {
      process.stderr.write(`  log API failed (${e instanceof Error ? e.message : e}); falling back to RPC\n`);
      return undefined;
    });
    if (fromApi) {
      const seen = new Set(logs.map((l) => `${l.transactionHash}-${l.logIndex}`));
      logs.push(...fromApi.filter((l) => !seen.has(`${l.transactionHash}-${l.logIndex}`)));
      start = toBlock + 1n;
    }
  }
  const ranges: [bigint, bigint][] = [];
  while (start <= toBlock) {
    const end = start + c.logChunk - 1n < toBlock ? start + c.logChunk - 1n : toBlock;
    ranges.push([start, end]);
    start = end + 1n;
  }
  const concurrency = Number(process.env.LOG_CONCURRENCY ?? 3);
  for (let i = 0; i < ranges.length; i += concurrency) {
    const batch = ranges.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(([from, to]) => withRetry(() => c.archive.getLogs({ address, event, fromBlock: from, toBlock: to }))),
    );
    for (const r of results as Log[][]) {
      for (const l of r as (Log & { args: Record<string, unknown> })[]) {
        logs.push({
          blockNumber: l.blockNumber!.toString(),
          transactionHash: l.transactionHash!,
          logIndex: l.logIndex!,
          args: l.args,
        });
      }
    }
    const scannedTo = batch[batch.length - 1][1];
    if (ranges.length > 20 && (i / concurrency) % 25 === 0) {
      process.stderr.write(`  ${event.name} ${address.slice(0, 10)}…: ${Math.min(i + concurrency, ranges.length)}/${ranges.length} chunks\n`);
      writeCache(rel, { scannedTo: scannedTo.toString(), logs });
    }
  }
  logs.sort((a, b) => (BigInt(a.blockNumber) === BigInt(b.blockNumber) ? a.logIndex - b.logIndex : BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1 : 1));
  writeCache(rel, { scannedTo: toBlock.toString(), logs });
  return logs;
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let delay = 1000;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

export { readCache, writeCache };
