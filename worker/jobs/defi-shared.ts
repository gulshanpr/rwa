import { getAddress, parseAbi, zeroAddress, type Address } from "viem";
import { clientsFor } from "@/discovery/rpc";
import type { Asset, Chain } from "@/lib/schema/asset";
import { catalog } from "../util";

export type OracleType = "fixed" | "nav-feed" | "market";

// Feeds that carry the issuer's NAV for this asset: the curated reference, PoR feeds,
// and every contract discovery tagged with role "oracle".
export async function navFeeds(asset: Asset, chain: Chain): Promise<Set<string>> {
  const out = new Set<string>();
  const ref = asset.pricing.reference;
  if ((ref.type === "oracle" || ref.type === "vault") && ref.address && ref.chain === chain) out.add(ref.address.toLowerCase());
  for (const m of asset.verification.methods) if (m.feed?.chain === chain) out.add(m.feed.address.toLowerCase());
  for (const s of (await catalog()).snapshots.get(asset.slug) ?? []) {
    if (s.discovered.chain !== chain) continue;
    for (const [addr, c] of Object.entries(s.discovered.contracts)) if (c.role === "oracle") out.add(addr.toLowerCase());
  }
  return out;
}

const MORPHO_ORACLE_ABI = parseAbi([
  "function BASE_FEED_1() view returns (address)",
  "function BASE_FEED_2() view returns (address)",
  "function QUOTE_FEED_1() view returns (address)",
  "function QUOTE_FEED_2() view returns (address)",
  "function BASE_VAULT() view returns (address)",
]);

// Classifies a Morpho Chainlink-style oracle by the feeds it composes.
export async function classifyMorphoOracle(asset: Asset, chain: Chain, oracle: Address): Promise<{ type: OracleType; description: string }> {
  const { client } = clientsFor(chain);
  const read = (fn: "BASE_FEED_1" | "BASE_FEED_2" | "QUOTE_FEED_1" | "QUOTE_FEED_2" | "BASE_VAULT") =>
    client.readContract({ address: oracle, abi: MORPHO_ORACLE_ABI, functionName: fn }).catch(() => undefined);
  const [b1, b2, q1, q2, vault] = await Promise.all([read("BASE_FEED_1"), read("BASE_FEED_2"), read("QUOTE_FEED_1"), read("QUOTE_FEED_2"), read("BASE_VAULT")]);
  if (b1 === undefined) return { type: "market", description: "Custom oracle, not a standard Morpho Chainlink oracle; needs review." };

  const nav = await navFeeds(asset, chain);
  const base = [b1, b2].filter((a): a is Address => !!a && a !== zeroAddress);
  if (base.some((a) => nav.has(a.toLowerCase()))) return { type: "nav-feed", description: `Reads the issuer NAV feed ${short(base[0]!)}.` };
  if (vault && nav.has(vault.toLowerCase())) return { type: "nav-feed", description: `Reads the vault's own exchange rate (BASE_VAULT ${short(vault)}).` };
  if (base.length === 0 && (!vault || vault === zeroAddress)) {
    const quote = [q1, q2].filter((a) => a && a !== zeroAddress);
    return { type: "fixed", description: quote.length ? "No feed for the collateral; priced at a fixed 1:1 against the quote feed." : "No price feeds; hard-coded 1:1 price." };
  }
  return { type: "market", description: `Uses feed ${short(base[0] ?? vault!)}, not the issuer NAV feed.` };
}

export async function classifyFeed(asset: Asset, chain: Chain, feed: Address): Promise<{ type: OracleType; description: string }> {
  if ((await navFeeds(asset, chain)).has(feed.toLowerCase())) return { type: "nav-feed", description: `Reads the issuer NAV feed ${short(feed)}.` };
  return { type: "market", description: `Uses price source ${short(feed)}, not the issuer NAV feed; needs review.` };
}

const short = (a: string) => `${getAddress(a).slice(0, 6)}…${a.slice(-4)}`;
