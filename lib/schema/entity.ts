import { z } from "zod";

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
});

export type Entity = z.infer<typeof EntitySchema>;
