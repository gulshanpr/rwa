import type { Abi, Address } from "viem";
import { readCache, writeCache, withRetry } from "./rpc";

export interface VerifiedSource {
  verified: boolean;
  name?: string;
  abi: Abi;
  /** path → Solidity source */
  sources: Record<string, string>;
}

const EMPTY: VerifiedSource = { verified: false, abi: [], sources: {} };

async function fromSourcify(chainId: number, address: Address): Promise<VerifiedSource | undefined> {
  const res = await fetch(`https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=abi,sources,compilation`);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Sourcify ${res.status} for ${address}`);
  const d = (await res.json()) as {
    abi?: Abi;
    sources?: Record<string, { content: string }>;
    compilation?: { name?: string };
  };
  if (!d.abi) return undefined;
  return {
    verified: true,
    name: d.compilation?.name,
    abi: d.abi,
    sources: Object.fromEntries(Object.entries(d.sources ?? {}).map(([k, v]) => [k, v.content])),
  };
}

async function fromEtherscan(chainId: number, address: Address): Promise<VerifiedSource | undefined> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return undefined;
  const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${key}`;
  const d = (await (await fetch(url)).json()) as { status: string; result: { ABI: string; ContractName: string; SourceCode: string }[] };
  const r = d.result?.[0];
  if (d.status !== "1" || !r || r.ABI.startsWith("Contract source code not verified")) return undefined;
  let sources: Record<string, string> = { [`${r.ContractName}.sol`]: r.SourceCode };
  if (r.SourceCode.startsWith("{{")) {
    const json = JSON.parse(r.SourceCode.slice(1, -1)) as { sources: Record<string, { content: string }> };
    sources = Object.fromEntries(Object.entries(json.sources).map(([k, v]) => [k, v.content]));
  }
  return { verified: true, name: r.ContractName, abi: JSON.parse(r.ABI) as Abi, sources };
}

/** Verified ABI and source, from Sourcify (no key) or Etherscan V2 (needs ETHERSCAN_API_KEY). Cached on disk. */
export async function verifiedSource(chainId: number, address: Address): Promise<VerifiedSource> {
  const rel = `sources/${chainId}/${address.toLowerCase()}.json`;
  const hit = readCache<VerifiedSource>(rel);
  if (hit) return hit;
  const found =
    (await withRetry(() => fromSourcify(chainId, address)).catch(() => undefined)) ??
    (await fromEtherscan(chainId, address).catch(() => undefined)) ??
    EMPTY;
  writeCache(rel, found);
  return found;
}

export function hasFunction(abi: Abi, name: string): boolean {
  return abi.some((x) => x.type === "function" && x.name === name);
}

export interface PrivilegedFunction {
  name: string;
  modifiers: string[];
}

/**
 * Functions in the ABI whose verified source declares an `only*` modifier.
 * Interfaces are skipped so the modifiers come from the implementation.
 */
export function privilegedFunctions(src: VerifiedSource): PrivilegedFunction[] {
  const inAbi = new Set(
    src.abi.filter((x) => x.type === "function" && x.stateMutability !== "view" && x.stateMutability !== "pure").map((x) => (x as { name: string }).name),
  );
  const found = new Map<string, Set<string>>();
  for (const [file, content] of Object.entries(src.sources)) {
    const base = file.split("/").pop() ?? file;
    if (/^I[A-Z]/.test(base)) continue;
    const re = /function\s+(\w+)\s*\(([^)]*)\)([^{;]*)\{/g;
    for (const m of content.matchAll(re)) {
      const [, name, , tail] = m;
      if (!inAbi.has(name)) continue;
      const mods = [...tail.matchAll(/\b(only\w+)(\s*\(\s*([\w.]+)\s*\))?/g)].map((x) => (x[3] ? `${x[1]}(${x[3]})` : x[1]));
      if (mods.length === 0) continue;
      const set = found.get(name) ?? new Set<string>();
      mods.forEach((x) => set.add(x));
      found.set(name, set);
    }
  }
  return [...found.entries()].map(([name, mods]) => ({ name, modifiers: [...mods] })).sort((a, b) => a.name.localeCompare(b.name));
}
