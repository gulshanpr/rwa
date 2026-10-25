import { z } from "zod";
import { Chain } from "./asset";
import { Address } from "./sourced";

/** Market data for the Exit category, written by `bun framework:measure` to data/measured/<slug>.json. */
export const MeasuredSchema = z.object({
  asset: z.string(),
  asOf: z.iso.datetime(),
  holders: z
    .object({
      chain: Chain,
      count: z.number().int().optional(),
      top10Pct: z.number(),
      top: z.array(z.object({ address: Address, name: z.string().optional(), isContract: z.boolean(), pct: z.number() })),
      source: z.url(),
    })
    .optional(),
  dex: z.object({
    chain: Chain,
    navUsd: z.number(),
    quotes: z.array(
      z.object({
        sizeUsd: z.number(),
        routed: z.boolean(),
        outUsd: z.number().optional(),
        /** Shortfall against NAV, in percent. */
        slippagePct: z.number().optional(),
      }),
    ),
    source: z.url(),
  }),
});

export type Measured = z.infer<typeof MeasuredSchema>;
