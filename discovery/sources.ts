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

function fromEtherscanBody(d: { status?: string; result?: { ABI?: string; ContractName?: string; SourceCode?: string }[] }): VerifiedSource | undefined {
  const r = d.result?.[0];
  if (d.status !== "1" || !r?.ABI || !r.ContractName || r.ABI.startsWith("Contract source code not verified")) return undefined;
  let sources: Record<string, string> = { [`${r.ContractName}.sol`]: r.SourceCode ?? "" };
  if (r.SourceCode?.startsWith("{{")) {
    const json = JSON.parse(r.SourceCode.slice(1, -1)) as { sources: Record<string, { content: string }> };
    sources = Object.fromEntries(Object.entries(json.sources).map(([k, v]) => [k, v.content]));
  }
  return { verified: true, name: r.ContractName, abi: JSON.parse(r.ABI) as Abi, sources };
}

async function fromEtherscan(chainId: number, address: Address): Promise<VerifiedSource | undefined> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return undefined;
  const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${key}`;
  return fromEtherscanBody(await (await fetch(url)).json());
}

/** Snowtrace and other explorers that Sourcify and Blockscout don't cover. No key. */
async function fromRoutescan(chainId: number, address: Address): Promise<VerifiedSource | undefined> {
  const url = `https://api.routescan.io/v2/network/mainnet/evm/${chainId}/etherscan/api?module=contract&action=getsourcecode&address=${address}`;
  const res = await fetch(url);
  if (!res.ok) return undefined;
  return fromEtherscanBody(await res.json());
}

const BLOCKSCOUT: Record<number, string> = {
  1: "https://eth.blockscout.com",
  10: "https://optimism.blockscout.com",
  137: "https://polygon.blockscout.com",
  8453: "https://base.blockscout.com",
  42161: "https://arbitrum.blockscout.com",
};

async function fromBlockscout(chainId: number, address: Address): Promise<VerifiedSource | undefined> {
  const host = BLOCKSCOUT[chainId];
  if (!host) return undefined;
  const res = await fetch(`${host}/api/v2/smart-contracts/${address}`);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Blockscout ${res.status} for ${address}`);
  const d = (await res.json()) as {
    is_verified?: boolean;
    name?: string;
    abi?: Abi;
    file_path?: string;
    source_code?: string;
    additional_sources?: { file_path: string; source_code: string }[];
  };
  if (!d.is_verified || !d.abi) return undefined;
  const sources: Record<string, string> = { [d.file_path || `${d.name ?? "Contract"}.sol`]: d.source_code ?? "" };
  for (const s of d.additional_sources ?? []) sources[s.file_path] = s.source_code;
  return { verified: true, name: d.name, abi: d.abi, sources };
}

/** Unverified results are re-checked after this long, in case the contract gets verified. */
const RECHECK_UNVERIFIED_MS = 7 * 86_400_000;

/** Verified ABI and source, from Sourcify, Blockscout, Routescan, or Etherscan V2 (needs ETHERSCAN_API_KEY). Cached on disk. */
export async function verifiedSource(chainId: number, address: Address): Promise<VerifiedSource> {
  const rel = `sources/${chainId}/${address.toLowerCase()}.json`;
  const hit = readCache<VerifiedSource & { checkedAt?: number }>(rel);
  if (hit && (hit.verified || Date.now() - (hit.checkedAt ?? 0) < RECHECK_UNVERIFIED_MS)) return hit;
  const found =
    (await withRetry(() => fromSourcify(chainId, address)).catch(() => undefined)) ??
    (await withRetry(() => fromBlockscout(chainId, address), 3).catch(() => undefined)) ??
    (await withRetry(() => fromRoutescan(chainId, address), 3).catch(() => undefined)) ??
    (await fromEtherscan(chainId, address).catch(() => undefined));
  writeCache(rel, found ?? { ...EMPTY, checkedAt: Date.now() });
  return found ?? EMPTY;
}

export function hasFunction(abi: Abi, name: string): boolean {
  return abi.some((x) => x.type === "function" && x.name === name);
}

export interface PrivilegedFunction {
  name: string;
  modifiers: string[];
}

/** Internal calls at the top of a function body that act as an access check, e.g. `_checkOwner()` or `_requireAuth()`. */
const INLINE_GUARD = /\b(_(?:check|require|assert|only)\w*(?:Owner|Auth|Admin|Manager|Ward|Minter|Reporter|Guardian|Safe)\w*)\s*\(\s*\)\s*;/g;
const INLINE_ROLE = /(?:\b_checkRole\s*\(\s*([\w.]+)\s*\)|require\s*\(\s*hasRole\s*\(\s*([\w.]+)\s*,\s*(?:_msgSender\(\)|msg\.sender)\s*\))/g;
/** Only the first statements count; later calls are usually unrelated checks. */
const GUARD_WINDOW = 400;

function guardsOf(tail: string, body: string): string[] {
  const head = tail.replace(/returns\s*\([^)]*\)/, "");
  const mods = [...head.matchAll(/\b(only\w+|auth|requiresAuth)\b(\s*\(\s*([\w.]+)\s*\))?/g)].map((x) => (x[3] ? `${x[1]}(${x[3]})` : x[1]));
  const start = body.slice(0, GUARD_WINDOW);
  for (const x of start.matchAll(INLINE_ROLE)) mods.push(`onlyRole(${x[1] ?? x[2]})`);
  for (const x of start.matchAll(INLINE_GUARD)) mods.push(x[1] === "_checkOwner" ? "onlyOwner" : `${x[1]}()`);
  return mods;
}

/**
 * Functions in the ABI whose verified source guards them with a modifier (`only*`, `auth`, `requiresAuth`)
 * or an inline check at the top of the body. A UUPS `upgradeTo` inherits the guard on `_authorizeUpgrade`.
 * Interfaces are skipped so the guards come from the implementation.
 */
export function privilegedFunctions(src: VerifiedSource): PrivilegedFunction[] {
  const inAbi = new Set(
    src.abi.filter((x) => x.type === "function" && x.stateMutability !== "view" && x.stateMutability !== "pure").map((x) => (x as { name: string }).name),
  );
  const found = new Map<string, Set<string>>();
  const authorizeUpgrade = new Set<string>();
  for (const [file, content] of Object.entries(src.sources)) {
    const base = file.split("/").pop() ?? file;
    if (/^I[A-Z]/.test(base)) continue;
    const re = /function\s+(\w+)\s*\(([^)]*)\)([^{;]*)\{/g;
    for (const m of content.matchAll(re)) {
      const [, name, , tail] = m;
      if (!inAbi.has(name) && name !== "_authorizeUpgrade") continue;
      const mods = guardsOf(tail, content.slice(m.index + m[0].length)).filter((x) => x !== "onlyProxy");
      if (mods.length === 0) continue;
      const set = name === "_authorizeUpgrade" ? authorizeUpgrade : (found.get(name) ?? new Set<string>());
      mods.forEach((x) => set.add(x));
      if (name !== "_authorizeUpgrade") found.set(name, set);
    }
  }
  if (authorizeUpgrade.size > 0)
    for (const fn of ["upgradeTo", "upgradeToAndCall"]) if (inAbi.has(fn)) found.set(fn, new Set([...(found.get(fn) ?? []), ...authorizeUpgrade]));
  return [...found.entries()].map(([name, mods]) => ({ name, modifiers: [...mods] })).sort((a, b) => a.name.localeCompare(b.name));
}
