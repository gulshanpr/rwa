import { getAddress, parseAbi, parseAbiItem, zeroAddress, type Address } from "viem";
import type { Context } from "../context";
import { mapFunctions } from "../powers";
import { deploymentBlock, scanLogs } from "../rpc";
import { privilegedFunctions } from "../sources";

/** Service ids from IDSServiceConsumer. DS_TOKEN (2) is the token itself. */
const SERVICES: Record<number, string> = {
  1: "TrustService",
  4: "RegistryService",
  8: "ComplianceService",
  32: "WalletManager",
  64: "LockManager",
  128: "PartitionsManager",
  256: "ComplianceConfigurationService",
  512: "TokenIssuer",
  1024: "WalletRegistrar",
  2048: "OmnibusTBEController",
  4096: "TransactionRelayer",
  8192: "TokenReallocator",
  16384: "SecuritizeSwap",
};

const ROLE = { MASTER: 1, ISSUER: 2, EXCHANGE: 4, TRANSFER_AGENT: 8 } as const;
const ROLE_NAMES: Record<number, string> = { 1: "MASTER", 2: "ISSUER", 4: "EXCHANGE", 8: "TRANSFER_AGENT" };

const ABI = parseAbi([
  "function getDSService(uint256 serviceId) view returns (address)",
  "function getRole(address user) view returns (uint8)",
  "function contractOwner() view returns (address)",
  "function owner() view returns (address)",
]);
const ROLE_ADDED = parseAbiItem("event DSTrustServiceRoleAdded(address targetAddress, uint8 role, address sender)");
const ROLE_REMOVED = parseAbiItem("event DSTrustServiceRoleRemoved(address targetAddress, uint8 role, address sender)");

/** Modifiers that only let another contract (or a specific argument) through. Not key-held. */
const CONTRACT_ONLY =
  /^(onlyToken|onlyRegistry|onlyOmnibusWalletController|onlyTBEOmnibus|onlyProxy|onlyOperator|onlyNew\w*|onlyExisting\w*|onlySame\w*)$/;

interface DsRoles {
  byRole: Record<number, Address[]>;
}

async function replayRoles(ctx: Context, trust: Address, candidates: Address[]): Promise<DsRoles> {
  const from = await deploymentBlock(ctx.c, trust, ctx.block);
  const added = await scanLogs(ctx.c, trust, ROLE_ADDED, from, ctx.block);
  const removed = await scanLogs(ctx.c, trust, ROLE_REMOVED, from, ctx.block);
  const seen = new Set(candidates.map((a) => getAddress(a)));
  for (const l of [...added, ...removed]) {
    seen.add(getAddress(l.args.targetAddress as string));
    seen.add(getAddress(l.args.sender as string));
  }
  const byRole: Record<number, Address[]> = { 1: [], 2: [], 4: [], 8: [] };
  const list = [...seen];
  const roles = await Promise.all(list.map((a) => ctx.read<number>(trust, ABI, "getRole", [a])));
  list.forEach((a, i) => {
    const r = Number(roles[i] ?? 0);
    if (byRole[r]) byRole[r].push(a);
  });
  for (const k of Object.keys(byRole)) byRole[Number(k)].sort();
  return { byRole };
}

export async function dsProtocol(ctx: Context, token: Address) {
  const services: { id: number; name: string; address: Address }[] = [
    { id: 2, name: "DSToken", address: getAddress(token) },
  ];
  for (const [id, name] of Object.entries(SERVICES)) {
    const a = await ctx.read<Address>(token, ABI, "getDSService", [BigInt(id)]);
    if (a && a !== zeroAddress) services.push({ id: Number(id), name, address: getAddress(a) });
  }
  const trust = services.find((s) => s.id === 1)?.address;
  if (!trust) throw new Error(`ds-protocol: ${token} has no TrustService (getDSService(1) returned 0x0)`);

  const proxies = await Promise.all(services.map((s) => ctx.detectProxy(s.address)));
  // Older DS proxies expose contractOwner(). Newer UUPS services (the ACRED OnRamp) expose owner().
  const owners = await Promise.all(
    services.map(async (s) => {
      const legacy = await ctx.read<Address>(s.address, ABI, "contractOwner");
      if (legacy && legacy !== zeroAddress) return legacy;
      return ctx.read<Address>(s.address, ABI, "owner");
    }),
  );
  const candidates = [...proxies.map((p) => p?.admin), ...owners].filter((a): a is Address => Boolean(a));
  const { byRole } = await replayRoles(ctx, trust, candidates);

  const masters = byRole[ROLE.MASTER];
  const issuers = byRole[ROLE.ISSUER];
  const exchanges = byRole[ROLE.EXCHANGE];
  const agents = byRole[ROLE.TRANSFER_AGENT];
  const label = (...roles: number[]) => roles.map((r) => ROLE_NAMES[r]).join(", ");
  const ignore = ctx.asset.deployments.find((d) => d.chain === ctx.chain)?.discovery.ignoreMethods ?? [];

  for (const [i, s] of services.entries()) {
    const proxy = proxies[i];
    const impl = proxy?.implementation ?? s.address;
    const src = await ctx.source(impl);
    const contractOwner = owners[i] ? [getAddress(owners[i]!)] : [];
    const isTrust = s.id === 1;

    const holdersFor = (modifier: string): { holders: Address[]; label: string } | undefined => {
      const base = modifier.replace(/\(.*\)$/, "");
      if (CONTRACT_ONLY.test(base)) return undefined;
      const uniq = (xs: Address[]) => [...new Set(xs)];
      switch (base) {
        case "onlyMaster":
        case "onlyMasterOrTBEOmnibus":
          return isTrust
            ? { holders: masters, label: label(1) }
            : { holders: uniq([...masters, ...contractOwner]), label: "MASTER or contract owner" };
        case "onlyMasterOrIssuer":
        case "onlyEntityOwnerOrAbove":
          return { holders: uniq([...masters, ...issuers]), label: label(1, 2) };
        case "onlyMasterOrIssuerOrTransferAgent":
          return { holders: uniq([...masters, ...issuers, ...agents]), label: label(1, 2, 8) };
        case "onlyIssuerOrAbove":
        case "onlyIssuerOrAboveOrToken":
          return { holders: uniq([...issuers, ...masters]), label: label(2, 1) };
        case "onlyTransferAgentOrAbove":
        case "onlyTransferAgentOrAboveOrToken":
          return { holders: uniq([...agents, ...masters]), label: label(8, 1) };
        case "onlyIssuerOrTransferAgentOrAbove":
          return { holders: uniq([...issuers, ...agents, ...masters]), label: label(2, 8, 1) };
        case "onlyExchangeOrAbove":
          return { holders: uniq([...exchanges, ...issuers, ...agents, ...masters]), label: label(4, 2, 8, 1) };
        case "onlyOwnerOrExchangeOrAbove":
          return {
            holders: uniq([...contractOwner, ...exchanges, ...issuers, ...agents, ...masters]),
            label: "owner, " + label(4, 2, 8, 1),
          };
        case "onlyOwner":
          return { holders: contractOwner, label: "contract owner" };
        default:
          return {
            holders: proxy?.admin ? [proxy.admin] : contractOwner,
            label: "unrecognized modifier, needs review",
          };
      }
    };

    const name = src.name ?? s.name;
    const permissions = mapFunctions(ctx, name, privilegedFunctions(src), holdersFor, ignore);
    if (proxy?.admin) {
      ctx.grant(permissions, "upgrade", [proxy.admin], `Proxy.setTarget · proxy owner`);
      ctx.grant(permissions, "admin", [proxy.admin], `Proxy.setOwner · proxy owner`);
    }
    ctx.addContract(s.address, {
      name: s.id === 2 ? name : `${name} (service ${s.id})`,
      role: s.id === 2 ? "token" : "service",
      ...(proxy ? { proxy } : {}),
      verified: src.verified,
      permissions,
    });
  }

  return { roles: Object.fromEntries(Object.entries(byRole).map(([r, xs]) => [ROLE_NAMES[Number(r)], xs])) };
}
