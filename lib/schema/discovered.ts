import { z } from "zod";
import { Address } from "./sourced";
import { Chain } from "./asset";

export const Power = z.enum([
  "upgrade",
  "mint",
  "force-transfer",
  "burn-from",
  "set-price",
  "allocate",
  "freeze",
  "pause",
  "set-compliance",
  "admin",
  "unclassified",
]);

const Permission = z.object({
  power: Power,
  holder: Address,
  via: z.string(),
});

const DiscoveredContract = z.object({
  name: z.string(),
  role: z.enum(["token", "proxy-admin", "service", "oracle", "other"]),
  proxy: z
    .object({
      type: z.enum(["eip1967", "uups", "beacon", "diamond", "custom"]),
      implementation: Address,
      admin: Address.optional(),
    })
    .optional(),
  verified: z.boolean(),
  permissions: z.array(Permission),
});

const Holder = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("eoa") }),
  z.object({
    kind: z.literal("safe"),
    threshold: z.number().int().positive(),
    owners: z.array(Address).min(1),
    modules: z.array(Address).default([]),
  }),
  z.object({
    kind: z.literal("timelock"),
    minDelaySeconds: z.number().int().nonnegative(),
    proposers: z.array(Address).min(1),
    executors: z.array(Address),
  }),
  z.object({ kind: z.literal("proxy-admin"), owner: Address }),
  /** A tracked contract (e.g. a DS service) that holds a role. It acts when its own controllers call it. */
  z.object({ kind: z.literal("contract"), name: z.string(), controllers: z.array(Address) }),
  z.object({ kind: z.literal("contract-unknown") }),
]);

export const DiscoveredSchema = z.object({
  asset: z.string(),
  chain: Chain,
  block: z.number().int(),
  timestamp: z.iso.datetime(),
  contracts: z.record(Address, DiscoveredContract),
  holders: z.record(Address, Holder),
});

export const DiscoveredMetaSchema = z.object({
  block: z.number().int(),
  timestamp: z.iso.datetime(),
  toolVersion: z.string(),
  sample: z.boolean().default(false),
});

export type Power = z.infer<typeof Power>;
export type Permission = z.infer<typeof Permission>;
export type DiscoveredContract = z.infer<typeof DiscoveredContract>;
export type Holder = z.infer<typeof Holder>;
export type Discovered = z.infer<typeof DiscoveredSchema>;
export type DiscoveredMeta = z.infer<typeof DiscoveredMetaSchema>;
