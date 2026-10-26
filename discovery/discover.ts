import fs from "node:fs";
import path from "node:path";
import { getAddress, type Address } from "viem";
import type { Asset, Chain } from "@/lib/schema/asset";
import { DiscoveredSchema, type Discovered, type DiscoveredMeta } from "@/lib/schema/discovered";
import { Context } from "./context";
import { centrifuge } from "./handlers/centrifuge";
import { dsProtocol } from "./handlers/ds-protocol";
import { hashnote } from "./handlers/hashnote";
import { maplePool } from "./handlers/maple";
import { midas } from "./handlers/midas";
import { ondo } from "./handlers/ondo";
import { oracleFeed } from "./handlers/oracle";
import { ozStandard } from "./handlers/oz-access-control";
import { pareto } from "./handlers/pareto";
import { superstate } from "./handlers/superstate";
import { clientsFor } from "./rpc";

export const TOOL_VERSION = "discovery-0.2.0";

/** Platforms with their own handler. Each maps the token, its oracle and the contracts they rely on. */
const PLATFORMS: Record<string, (ctx: Context, token: Address) => Promise<unknown>> = { superstate, ondo, hashnote, centrifuge, pareto, midas };
/** Blocks behind head, so a snapshot never lands on a block that later reorgs. */
const CONFIRMATIONS = 12n;

export interface DiscoveryResult {
  discovered: Discovered;
  meta: DiscoveredMeta;
  extra: Record<string, unknown>;
}

export async function discover(asset: Asset, chain: Chain): Promise<DiscoveryResult> {
  const deployment = asset.deployments.find((d) => d.chain === chain);
  if (!deployment) throw new Error(`${asset.slug} has no ${chain} deployment`);
  const { client } = clientsFor(chain);
  const head = await client.getBlockNumber();
  const block = head - CONFIRMATIONS;
  const { timestamp } = await client.getBlock({ blockNumber: block });
  const ctx = new Context(asset, chain, block);
  const token = getAddress(deployment.token) as Address;
  const extra: Record<string, unknown> = {};

  if (asset.tokenStandard === "ds-protocol") {
    extra.dsRoles = (await dsProtocol(ctx, token)).roles;
  } else if (asset.tokenStandard === "erc4626" && asset.platform === "maple") {
    extra.maple = await maplePool(ctx, token);
  } else if (PLATFORMS[asset.platform]) {
    extra[asset.platform] = await PLATFORMS[asset.platform](ctx, token);
  } else {
    const proxy = await ctx.detectProxy(token);
    const { src, permissions } = await ozStandard(ctx, token, proxy?.implementation ?? token, "token");
    if (proxy?.admin) ctx.grant(permissions, "upgrade", [proxy.admin], `Proxy upgrade · ${proxy.type} admin`);
    ctx.addContract(token, { name: src.name ?? asset.ticker, role: "token", ...(proxy ? { proxy } : {}), verified: src.verified, permissions });
  }

  const ref = asset.pricing.reference;
  if (ref.type === "oracle" && ref.chain === chain && ref.address && !PLATFORMS[asset.platform]) await oracleFeed(ctx, getAddress(ref.address));

  const holders = await ctx.classifyHolders();
  const discovered = DiscoveredSchema.parse({
    asset: asset.slug,
    chain,
    block: Number(block),
    timestamp: new Date(Number(timestamp) * 1000).toISOString().replace(".000Z", "Z"),
    contracts: ctx.contracts,
    holders,
  });
  return {
    discovered,
    meta: { block: Number(block), timestamp: discovered.timestamp, toolVersion: TOOL_VERSION, sample: false },
    extra,
  };
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortDeep((value as Record<string, unknown>)[k])]));
  }
  return value;
}

function sortPermissions(d: Discovered): Discovered {
  for (const c of Object.values(d.contracts)) {
    c.permissions.sort((a, b) => a.power.localeCompare(b.power) || a.holder.localeCompare(b.holder) || a.via.localeCompare(b.via));
  }
  return d;
}

export function snapshotPaths(slug: string, chain: Chain) {
  const dir = path.join(process.cwd(), "discovered", slug);
  return { dir, file: path.join(dir, `${chain}.json`), meta: path.join(dir, `${chain}.meta.json`) };
}

export function serialize(d: Discovered): string {
  return JSON.stringify(sortDeep(sortPermissions(structuredClone(d))), null, 2) + "\n";
}

export function write(result: DiscoveryResult) {
  const { dir, file, meta } = snapshotPaths(result.discovered.asset, result.discovered.chain);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, serialize(result.discovered));
  fs.writeFileSync(meta, JSON.stringify(result.meta, null, 2) + "\n");
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Human-readable changes between two snapshots, ignoring block and timestamp. */
export function diffSummary(prev: Discovered | undefined, next: Discovered): string[] {
  if (!prev) return [`New snapshot: ${Object.keys(next.contracts).length} contracts, ${Object.keys(next.holders).length} holders.`];
  const lines: string[] = [];
  const key = (c: string, p: { power: string; holder: string }) => `${c}|${p.power}|${getAddress(p.holder)}`;
  const perms = (d: Discovered) => {
    const m = new Map<string, string>();
    for (const [addr, c] of Object.entries(d.contracts)) for (const p of c.permissions) m.set(key(getAddress(addr), p), `${c.name}: ${p.power} → ${short(p.holder)}`);
    return m;
  };
  const before = perms(prev);
  const after = perms(next);
  for (const [k, text] of after) if (!before.has(k)) lines.push(`Added: ${text}`);
  for (const [k, text] of before) if (!after.has(k)) lines.push(`Removed: ${text}`);

  const norm = (d: Discovered) => Object.fromEntries(Object.entries(d.contracts).map(([a, c]) => [getAddress(a), c]));
  const pc = norm(prev);
  for (const [addr, c] of Object.entries(norm(next))) {
    const old = pc[addr];
    if (!old) lines.push(`New contract: ${c.name} (${short(addr)})`);
    else if (old.proxy?.implementation?.toLowerCase() !== c.proxy?.implementation?.toLowerCase())
      lines.push(`${c.name} implementation ${short(old.proxy?.implementation ?? "none")} → ${short(c.proxy?.implementation ?? "none")}`);
    else if (old.proxy?.admin?.toLowerCase() !== c.proxy?.admin?.toLowerCase())
      lines.push(`${c.name} proxy admin ${short(old.proxy?.admin ?? "none")} → ${short(c.proxy?.admin ?? "none")}`);
  }

  const ph = Object.fromEntries(Object.entries(prev.holders).map(([a, h]) => [getAddress(a), h]));
  for (const [addr, h] of Object.entries(next.holders)) {
    const old = ph[getAddress(addr)];
    if (!old) continue;
    if (old.kind !== h.kind) lines.push(`Holder ${short(addr)} changed from ${old.kind} to ${h.kind}`);
    else if (old.kind === "safe" && h.kind === "safe") {
      if (old.threshold !== h.threshold || old.owners.length !== h.owners.length)
        lines.push(`Safe ${short(addr)} threshold ${old.threshold}/${old.owners.length} → ${h.threshold}/${h.owners.length}`);
      if (old.modules.length !== h.modules.length) lines.push(`Safe ${short(addr)} modules ${old.modules.length} → ${h.modules.length}`);
    } else if (old.kind === "timelock" && h.kind === "timelock" && old.minDelaySeconds !== h.minDelaySeconds)
      lines.push(`Timelock ${short(addr)} delay ${old.minDelaySeconds}s → ${h.minDelaySeconds}s`);
  }
  return lines;
}

export function sameContent(prev: Discovered | undefined, next: Discovered): boolean {
  if (!prev) return false;
  const strip = (d: Discovered) => serialize({ ...d, block: 0, timestamp: "1970-01-01T00:00:00Z" }).toLowerCase();
  return strip(prev) === strip(next);
}
