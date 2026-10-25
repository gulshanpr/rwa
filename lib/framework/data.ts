import fs from "node:fs";
import path from "node:path";
import { listFiles, parseOrThrow, readJson, readYaml } from "../data";
import { EntityFactsSchema, FrameworkSchema, MeasuredSchema, type EntityFacts, type Framework, type Measured } from "./schema";

// data/framework/assets/<slug>.yaml   curated framework facts (one per asset in data/assets)
// data/framework/entities.yaml        regulation and auditor tier per entity slug
// data/framework/measured/<slug>.json top holders and DEX quotes, written by `bun framework:measure`

const ROOT = process.cwd();

let frameworkCache: Map<string, Framework> | undefined;
export function loadFrameworks(): Map<string, Framework> {
  frameworkCache ??= new Map(
    listFiles("data/framework/assets", ".yaml").map((file) => {
      const fw = parseOrThrow(FrameworkSchema, readYaml(file), file);
      return [fw.asset, fw];
    }),
  );
  return frameworkCache;
}

let factsCache: Map<string, EntityFacts> | undefined;
export function loadEntityFacts(): Map<string, EntityFacts> {
  if (!factsCache) {
    const file = path.join(ROOT, "data/framework/entities.yaml");
    const parsed = fs.existsSync(file) ? parseOrThrow(EntityFactsSchema, readYaml(file), file) : { entities: [] };
    factsCache = new Map(parsed.entities.map((e) => [e.slug, e]));
  }
  return factsCache;
}

export function loadMeasured(slug: string): Measured | undefined {
  const file = path.join(ROOT, `data/framework/measured/${slug}.json`);
  if (!fs.existsSync(file)) return undefined;
  return parseOrThrow(MeasuredSchema, readJson(file), file);
}
