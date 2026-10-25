import { z } from "zod";
import { Sourced } from "./sourced";

export const AuditorTier = z.enum(["big-four", "pcaob-registered", "global-network", "other"]);

export const EntitySchema = z.object({
  slug: z.string(),
  name: z.string(),
  type: z.array(
    z.enum([
      "issuer",
      "manager",
      "platform",
      "custodian",
      "fund-administrator",
      "transfer-agent",
      "auditor",
      "oracle",
    ]),
  ),
  jurisdiction: z.string().optional(),
  lei: z.string().optional(),
  website: z.url().optional(),
  // Counterparties facts.
  /** Supervised as a bank, trust company, broker-dealer, adviser or licensed fund service provider. */
  regulated: Sourced(z.boolean()).optional(),
  regulator: z.string().optional(),
  /** `global-network`: a member firm of a top-ten international audit network, approved by its local regulator. */
  auditorTier: Sourced(AuditorTier).optional(),
});

export type Entity = z.infer<typeof EntitySchema>;
