import { getAddress, parseAbi, type Address } from "viem";
import type { Permission } from "@/lib/schema/discovered";
import type { Context } from "../context";

const ABI = parseAbi([
  "function getPriceFeedAdapter() view returns (address)",
  "function aggregator() view returns (address)",
  "function owner() view returns (address)",
]);

/**
 * A price feed and the contracts behind it (RedStone adapter, Chainlink aggregator).
 * Whoever can upgrade or own them can change the onchain price, so that is recorded as `set-price`.
 */
export async function oracleFeed(ctx: Context, feed: Address) {
  const chain: Address[] = [getAddress(feed)];
  const adapter =
    (await ctx.read<Address>(feed, ABI, "getPriceFeedAdapter")) ?? (await ctx.read<Address>(feed, ABI, "aggregator"));
  if (adapter) chain.push(getAddress(adapter));

  for (const [i, address] of chain.entries()) {
    const proxy = await ctx.detectProxy(address);
    const src = await ctx.source(proxy?.implementation ?? address);
    const permissions: Permission[] = [];
    if (proxy?.admin) ctx.grant(permissions, "set-price", [proxy.admin], `Proxy upgrade · ${proxy.type} admin`);
    const owner = await ctx.read<Address>(address, ABI, "owner");
    if (owner) ctx.grant(permissions, "set-price", [owner], `${src.name ?? "Feed"} · owner()`);
    ctx.addContract(address, {
      name: src.name ?? (i === 0 ? "Price feed" : "Price feed adapter"),
      role: "oracle",
      ...(proxy ? { proxy } : {}),
      verified: src.verified,
      permissions,
    });
  }
}
