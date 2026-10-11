import { getAddress, parseAbi, zeroAddress, type Abi, type Address, type Hex } from "viem";
import type { Asset, Chain } from "@/lib/schema/asset";
import type { DiscoveredContract, Holder, Permission } from "@/lib/schema/discovered";
import { clientsFor, type ChainClients } from "./rpc";
import { verifiedSource, type VerifiedSource } from "./sources";

export const SLOTS = {
  implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
} as const satisfies Record<string, Hex>;

const PROBE = parseAbi([
  "function owner() view returns (address)",
  "function target() view returns (address)",
  "function implementation() view returns (address)",
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function getModulesPaginated(address start, uint256 pageSize) view returns (address[] array, address next)",
  "function getMinDelay() view returns (uint256)",
]);

export type ProxyInfo = Omit<NonNullable<DiscoveredContract["proxy"]>, "implementation" | "admin"> & {
  implementation: Address;
  admin?: Address;
};

export class Context {
  readonly c: ChainClients;
  readonly contracts: Record<string, DiscoveredContract> = {};
  private readonly pendingHolders = new Set<string>();

  constructor(
    readonly asset: Asset,
    readonly chain: Chain,
    readonly block: bigint,
  ) {
    this.c = clientsFor(chain);
  }

  source(address: Address): Promise<VerifiedSource> {
    return verifiedSource(this.c.chainId, address);
  }

  async read<T>(address: Address, abi: Abi, functionName: string, args: unknown[] = []): Promise<T | undefined> {
    try {
      return (await this.c.client.readContract({ address, abi, functionName, args, blockNumber: this.block })) as T;
    } catch {
      return undefined;
    }
  }

  async readOrThrow<T>(address: Address, abi: Abi, functionName: string, args: unknown[] = []): Promise<T> {
    return (await this.c.client.readContract({ address, abi, functionName, args, blockNumber: this.block })) as T;
  }

  async slotAddress(address: Address, slot: Hex): Promise<Address | undefined> {
    const raw = await this.c.client.getStorageAt({ address, slot, blockNumber: this.block });
    if (!raw || BigInt(raw) === 0n) return undefined;
    return getAddress(`0x${raw.slice(-40)}`);
  }

  async hasCode(address: Address): Promise<boolean> {
    const code = await this.c.client.getCode({ address, blockNumber: this.block });
    return Boolean(code && code !== "0x");
  }

  async detectProxy(address: Address): Promise<ProxyInfo | undefined> {
    const impl = await this.slotAddress(address, SLOTS.implementation);
    if (impl) {
      const admin = await this.slotAddress(address, SLOTS.admin);
      return { type: "eip1967", implementation: impl, ...(admin ? { admin } : {}) };
    }
    const beacon = await this.slotAddress(address, SLOTS.beacon);
    if (beacon) {
      const implementation = await this.read<Address>(beacon, PROBE, "implementation");
      const admin = await this.read<Address>(beacon, PROBE, "owner");
      if (implementation) return { type: "beacon", implementation: getAddress(implementation), ...(admin ? { admin: getAddress(admin) } : {}) };
    }
    const target = await this.read<Address>(address, PROBE, "target");
    if (target && target !== zeroAddress) {
      const owner = await this.read<Address>(address, PROBE, "owner");
      return { type: "custom", implementation: getAddress(target), ...(owner ? { admin: getAddress(owner) } : {}) };
    }
    return undefined;
  }

  addContract(address: Address, contract: DiscoveredContract) {
    const key = getAddress(address);
    const existing = this.contracts[key];
    if (existing) {
      existing.permissions.push(...contract.permissions);
      return;
    }
    this.contracts[key] = contract;
  }

  grant(permissions: Permission[], power: Permission["power"], holders: Iterable<string>, via: string) {
    for (const h of holders) {
      const holder = getAddress(h);
      this.pendingHolders.add(holder);
      if (!permissions.some((p) => p.power === power && p.holder === holder && p.via === via)) permissions.push({ power, holder, via });
    }
  }

  /** Classifies every address that holds a permission, following ProxyAdmins and timelocks. */
  async classifyHolders(): Promise<Record<string, Holder>> {
    const out: Record<string, Holder> = {};
    const queue = [...this.pendingHolders];
    const depth = new Map(queue.map((a) => [a, 0]));
    while (queue.length > 0) {
      const address = queue.shift()! as Address;
      if (out[address]) continue;
      const d = depth.get(address) ?? 0;
      const holder = this.trackedContract(address) ?? (await this.classify(address));
      out[address] = holder;
      const next: string[] =
        holder.kind === "proxy-admin"
          ? [holder.owner]
          : holder.kind === "timelock"
            ? holder.proposers
            : holder.kind === "contract"
              ? holder.controllers
              : [];
      for (const n of next) {
        const a = getAddress(n);
        if (!out[a] && d < 4) {
          depth.set(a, d + 1);
          queue.push(a);
        }
      }
    }
    return out;
  }

  /** A role held by a contract we already mapped: it is controlled by whoever holds its own critical or high powers. */
  private trackedContract(address: Address): Holder | undefined {
    const c = this.contracts[getAddress(address)];
    if (!c) return undefined;
    const controllers = new Set<string>();
    for (const p of c.permissions) {
      if (p.power !== "unclassified" && getAddress(p.holder) !== getAddress(address)) controllers.add(getAddress(p.holder));
    }
    return { kind: "contract", name: c.name, controllers: [...controllers].sort() };
  }

  private async classify(address: Address): Promise<Holder> {
    if (!(await this.hasCode(address))) return { kind: "eoa" };
    const threshold = await this.read<bigint>(address, PROBE, "getThreshold");
    const owners = await this.read<Address[]>(address, PROBE, "getOwners");
    if (threshold !== undefined && owners) {
      const modules = await this.read<[Address[], Address]>(address, PROBE, "getModulesPaginated", ["0x0000000000000000000000000000000000000001", 50n]);
      return { kind: "safe", threshold: Number(threshold), owners: owners.map((o) => getAddress(o)), modules: (modules?.[0] ?? []).map((m) => getAddress(m)) };
    }
    const minDelay = await this.read<bigint>(address, PROBE, "getMinDelay");
    if (minDelay !== undefined) {
      const { timelockRoles } = await import("./handlers/oz-timelock");
      const roles = await timelockRoles(this, address);
      return { kind: "timelock", minDelaySeconds: Number(minDelay), proposers: roles.proposers, executors: roles.executors };
    }
    const src = await this.source(address);
    const owner = await this.read<Address>(address, PROBE, "owner");
    if (owner && /ProxyAdmin/.test(src.name ?? "")) return { kind: "proxy-admin", owner: getAddress(owner) };
    const proxy = await this.detectProxy(address);
    const impl = proxy ? await this.source(proxy.implementation) : src;
    if (impl.verified && owner && owner !== zeroAddress) {
      const controllers = [...new Set([getAddress(owner), ...(proxy?.admin ? [getAddress(proxy.admin)] : [])])].sort();
      return { kind: "contract", name: impl.name ?? "Owned contract", controllers };
    }
    return { kind: "contract-unknown" };
  }
}
