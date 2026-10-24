import { getAddress, keccak256, parseAbi, parseAbiItem, toHex, zeroHash, type Address, type Hex } from "viem";
import type { Context } from "../context";
import { mapFunctions } from "../powers";
import { deploymentBlock, scanLogs } from "../rpc";
import { hasFunction, privilegedFunctions } from "../sources";

const ROLE_GRANTED = parseAbiItem("event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)");
const ROLE_REVOKED = parseAbiItem("event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)");
const ABI = parseAbi([
  "function owner() view returns (address)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
]);

const KNOWN_ROLES = [
  "DEFAULT_ADMIN_ROLE",
  "MINTER_ROLE",
  "BURNER_ROLE",
  "PAUSER_ROLE",
  "UPGRADER_ROLE",
  "ADMIN_ROLE",
  "OPERATOR_ROLE",
  "MANAGER_ROLE",
  "FREEZER_ROLE",
  "BLACKLISTER_ROLE",
  "COMPLIANCE_ROLE",
  "ORACLE_ROLE",
  "PROPOSER_ROLE",
  "EXECUTOR_ROLE",
  "CANCELLER_ROLE",
];
const ROLE_BY_HASH = new Map<Hex, string>([
  [zeroHash, "DEFAULT_ADMIN_ROLE"],
  ...KNOWN_ROLES.slice(1).map((r) => [keccak256(toHex(r)), r] as [Hex, string]),
]);

export function roleName(hash: Hex): string {
  return ROLE_BY_HASH.get(hash) ?? `${hash.slice(0, 10)}…`;
}

/** Current members of every role, from RoleGranted/RoleRevoked logs, confirmed with hasRole at the snapshot block. */
export async function roleMembers(ctx: Context, address: Address): Promise<Map<Hex, Address[]>> {
  const from = await deploymentBlock(ctx.c, address, ctx.block);
  const granted = await scanLogs(ctx.c, address, ROLE_GRANTED, from, ctx.block);
  const revoked = await scanLogs(ctx.c, address, ROLE_REVOKED, from, ctx.block);
  const pairs = new Map<string, { role: Hex; account: Address }>();
  for (const l of [...granted, ...revoked]) {
    const role = l.args.role as Hex;
    const account = getAddress(l.args.account as string);
    pairs.set(`${role}|${account}`, { role, account });
  }
  const out = new Map<Hex, Address[]>();
  for (const { role, account } of pairs.values()) {
    if (await ctx.read<boolean>(address, ABI, "hasRole", [role, account])) out.set(role, [...(out.get(role) ?? []), account]);
  }
  return out;
}

/** OpenZeppelin Ownable, AccessControl and Pausable, mapped from verified source modifiers. */
export async function ozStandard(ctx: Context, address: Address, implementation: Address, contractRole: "token" | "service" | "oracle" | "other") {
  const src = await ctx.source(implementation);
  const fns = privilegedFunctions(src);
  const owner = hasFunction(src.abi, "owner") ? await ctx.read<Address>(address, ABI, "owner") : undefined;
  const members = hasFunction(src.abi, "hasRole") ? await roleMembers(ctx, address) : new Map<Hex, Address[]>();
  const byName = new Map([...members.entries()].map(([h, xs]) => [roleName(h), xs]));
  const ignore = ctx.asset.deployments.find((d) => d.chain === ctx.chain)?.discovery.ignoreMethods ?? [];

  const permissions = mapFunctions(
    ctx,
    src.name ?? "Contract",
    fns,
    (modifier) => {
      if (modifier === "onlyOwner") return owner ? { holders: [getAddress(owner)], label: "owner()" } : undefined;
      const m = /^onlyRole\((\w+)\)$/.exec(modifier);
      if (m) return { holders: members.get(m[1] === "DEFAULT_ADMIN_ROLE" ? zeroHash : keccak256(toHex(m[1]))) ?? [], label: m[1] };
      if (/^only(Proxy|Initializing|Delegated)/.test(modifier)) return undefined;
      return { holders: owner ? [getAddress(owner)] : [], label: "unrecognized modifier, needs review" };
    },
    ignore,
  );
  const admins = byName.get("DEFAULT_ADMIN_ROLE") ?? [];
  if (admins.length > 0) ctx.grant(permissions, "admin", admins, `${src.name ?? "Contract"}.grantRole, revokeRole · DEFAULT_ADMIN_ROLE`);
  return { src, permissions, contractRole };
}
