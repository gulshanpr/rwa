import { z } from "zod";

export const IsoDate = z.iso.date();

export const Address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Expected a 20-byte hex address");

export const Source = z
  .object({
    url: z.url().optional(),
    tx: z.string().optional(),
    note: z.string().optional(),
    checkedAt: IsoDate,
  })
  .refine((s) => s.url || s.tx, "A source needs a url or tx");

export const Sourced = <T extends z.ZodType>(value: T) =>
  z.object({ value, source: Source });

export const Disclosed = <T extends z.ZodType>(value: T) =>
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("public"), value, source: Source }),
    z.object({
      status: z.literal("not_public"),
      searchedAt: IsoDate,
      note: z.string().optional(),
    }),
    z.object({ status: z.literal("unknown"), note: z.string().optional() }),
  ]);

export type Source = z.infer<typeof Source>;
export type Sourced<T> = { value: T; source: Source };
export type Disclosed<T> =
  | { status: "public"; value: T; source: Source }
  | { status: "not_public"; searchedAt: string; note?: string }
  | { status: "unknown"; note?: string };
