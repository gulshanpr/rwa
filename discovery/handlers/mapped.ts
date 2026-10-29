import { getAddress, keccak256, parseAbi, parseAbiItem, toHex, zeroHash, type Address, type Hex } from "viem";
import type { DiscoveredContract, Permission, Power } from "@/lib/schema/discovered";
import type { Context, ProxyInfo } from "../context";
import { powerForFunction } from "../powers";
import { deploymentBlock, scanLogs } from "../rpc";
import { hasFunction, privilegedFunctions, type VerifiedSource } from "../sources";
import { roleMembers } from "./oz-access-control";

export interface Holders {
  holders: Address[];
  label: string;
}

interface Rule {
  power: Power;
  fns: string[];
  holders: Address[];
  via: string;
}

interface MappedOptions {
  name?: string;
  role: DiscoveredContract["role"];
  /**
   * Guard (modifier or inline check, as `privilegedFunctions` reports it) → who passes it.
   * `null` means only other contracts pass, so it is not scored. Unlisted guards resolve as
   * `onlyOwner` → owner(), `onlyRole(X)` → current members of X, and anything else is a warning.
   */
  guards?: Record<string, Holders | null>;
  /** Resolves guards whose holders depend on the function (capability-based authorities). Checked before `guards`. */
  guardFor?: (modifier: string, fn: string) => Promise<Holders | null | undefined>;
  /** Function → power, where the name alone would map to the wrong power. */
  powers?: Record<string, Power>;
  /** Functions guarded in a way no modifier shows (`msg.sender == x` checks, allowances). */
  rules?: Rule[];
  /** Privileged functions that were reviewed and are deliberately not scored. */
  notScored?: string[];
  /** Map only `rules`: for shared contracts where most guarded functions don't concern this asset. */
  rulesOnly?: boolean;
}

interface Mapped {
  name: string;
  roles: Map<Hex, Address[]>;
  src: VerifiedSource;
  proxy?: ProxyInfo;
  owner?: Address;
}

const ABI = parseAbi(["function owner() view returns (address)", "function wards(address) view returns (uint256)"]);
const CONTRACT_ONLY = /^(onlyProxy|onlyInitializing|onlyDelegated\w*|onlyRole)$/;
const RELY = parseAbiItem("event Rely(address indexed user)");
const DENY = parseAbiItem("event Deny(address indexed user)");

export const roleHash = (name: string): Hex => (name === "DEFAULT_ADMIN_ROLE" ? zeroHash : keccak256(toHex(name)));

const list = (fns: string[]) =>
  fns.length > 3 ? `${fns.slice(0, 3).join(", ")} +${fns.length - 3} more` : fns.join(", ");

/** Current `wards` of a MakerDAO-style `auth` contract: every Rely/Deny target, confirmed with wards(x) == 1. */
/** Current wards, from Rely/Deny logs, or only among `known` when logs can't be scanned (a lower bound). */
export async function wardsOf(ctx: Context, address: Address, known?: Address[]): Promise<Address[]> {
  let candidates = known;
  if (!candidates) {
    const from = await deploymentBlock(ctx.c, address, ctx.block);
    const logs = [
      ...(await scanLogs(ctx.c, address, RELY, from, ctx.block)),
      ...(await scanLogs(ctx.c, address, DENY, from, ctx.block)),
    ];
    candidates = [...new Set(logs.map((l) => getAddress(l.args.user as string)))];
  }
  const active = await Promise.all(candidates.map((a) => ctx.readOrThrow<bigint>(address, ABI, "wards", [a])));
  return candidates.filter((_, i) => active[i] === 1n).sort();
}

/**
 * Adds a contract with every privileged function in its verified source mapped to a power and the
 * addresses that pass its guard. Proxies are followed; an EIP-1967 admin gets the upgrade power
 * (set-price on an oracle, since replacing its code changes the price).
 */
export async function addMapped(ctx: Context, address: Address, opts: MappedOptions, warn: string[]): Promise<Mapped> {
  address = getAddress(address);
  const proxy = await ctx.detectProxy(address);
  const src = await ctx.source(proxy?.implementation ?? address);
  const name = opts.name ?? src.name ?? "Contract";
  const owner = hasFunction(src.abi, "owner") ? await ctx.read<Address>(address, ABI, "owner") : undefined;
  const roles =
    !opts.rulesOnly && hasFunction(src.abi, "hasRole") ? await roleMembers(ctx, address) : new Map<Hex, Address[]>();
  const deployment = ctx.asset.deployments.find((d) => d.chain === ctx.chain);
  const ignore = new Set([...(opts.notScored ?? []), ...(deployment?.discovery.ignoreMethods ?? [])]);
  const abiFns = new Set(src.abi.filter((x) => x.type === "function").map((x) => (x as { name: string }).name));

  const resolve = async (modifier: string, fn: string): Promise<Holders | null | undefined> => {
    const custom = await opts.guardFor?.(modifier, fn);
    if (custom !== undefined) return custom;
    if (opts.guards && modifier in opts.guards) return opts.guards[modifier];
    if (CONTRACT_ONLY.test(modifier)) return null;
    if (modifier === "onlyOwner" || modifier === "_assertOwner()")
      return owner ? { holders: [getAddress(owner)], label: "owner()" } : undefined;
    const role = /^onlyRole\((\w+)\)$/.exec(modifier)?.[1];
    if (role) return { holders: roles.get(roleHash(role)) ?? [], label: role };
    return undefined;
  };

  const permissions: Permission[] = [];
  const mapped = new Set<string>();
  for (const r of opts.rules ?? []) {
    const present = r.fns.filter((f) => !src.verified || abiFns.has(f));
    if (present.length === 0) continue;
    present.forEach((f) => mapped.add(f));
    ctx.grant(permissions, r.power, r.holders, `${name}.${list(present)} · ${r.via}`);
  }

  const groups = new Map<string, { power: Power; modifier: string; who: Holders; fns: string[] }>();
  for (const fn of opts.rulesOnly ? [] : privilegedFunctions(src)) {
    if (mapped.has(fn.name) || ignore.has(fn.name)) continue;
    const seen = new Set<string>();
    for (const modifier of fn.modifiers) {
      const who = await resolve(modifier, fn.name);
      if (who === null) continue;
      if (!who) {
        warn.push(`${name}.${fn.name} (${modifier}) has a guard no rule resolves; review it.`);
        continue;
      }
      const same = who.holders
        .map((h) => h.toLowerCase())
        .sort()
        .join();
      if (seen.has(same)) continue;
      seen.add(same);
      const named = opts.powers?.[fn.name] ?? powerForFunction(fn.name);
      const power = named === "upgrade" && opts.role === "oracle" ? "set-price" : named;
      const key = `${power}|${modifier}|${who.label}`;
      const g = groups.get(key) ?? { power, modifier, who, fns: [] };
      g.fns.push(fn.name);
      groups.set(key, g);
    }
  }
  for (const g of groups.values()) {
    const label = g.who.label && !g.modifier.includes(g.who.label) ? ` (${g.who.label})` : "";
    ctx.grant(permissions, g.power, g.who.holders, `${name}.${list(g.fns)} · ${g.modifier}${label}`);
  }

  const admins = roles.get(zeroHash) ?? [];
  if (admins.length > 0) ctx.grant(permissions, "admin", admins, `${name}.grantRole, revokeRole · DEFAULT_ADMIN_ROLE`);
  if (proxy?.admin)
    ctx.grant(
      permissions,
      opts.role === "oracle" ? "set-price" : "upgrade",
      [proxy.admin],
      `Proxy upgrade · ${proxy.type} admin`,
    );

  ctx.addContract(address, { name, role: opts.role, ...(proxy ? { proxy } : {}), verified: src.verified, permissions });
  return { name, roles, src, proxy, owner: owner ? getAddress(owner) : undefined };
}

export function reportWarnings(tag: string, warn: string[]) {
  for (const w of warn) process.stderr.write(`  ${tag}: ${w}\n`);
}
