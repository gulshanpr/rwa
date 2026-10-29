import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { AssetSchema, type Asset } from "./schema/asset";
import { DiscoveredMetaSchema, DiscoveredSchema, type Discovered, type DiscoveredMeta } from "./schema/discovered";
import { EntitySchema, type Entity } from "./schema/entity";
import { MeasuredSchema, type Measured } from "./schema/measured";

const ROOT = process.cwd();

function readYaml(file: string): unknown {
  return YAML.parse(fs.readFileSync(file, "utf8"));
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown, file: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid data in ${path.relative(ROOT, file)}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

// Data folders are included in server output via outputFileTracingIncludes in next.config.ts.
function listFiles(dir: string, ext: string): string[] {
  const abs = path.join(/*turbopackIgnore: true*/ ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => path.join(/*turbopackIgnore: true*/ abs, f));
}

let assetsCache: Asset[] | undefined;
export function loadAssets(): Asset[] {
  assetsCache ??= listFiles("data/assets", ".yaml").map((file) => parseOrThrow(AssetSchema, readYaml(file), file));
  return assetsCache;
}

let entitiesCache: Map<string, Entity> | undefined;
export function loadEntities(): Map<string, Entity> {
  entitiesCache ??= new Map(
    listFiles("data/entities", ".yaml").map((file) => {
      const entity = parseOrThrow(EntitySchema, readYaml(file), file);
      return [entity.slug, entity];
    }),
  );
  return entitiesCache;
}

export interface DiscoverySnapshot {
  discovered: Discovered;
  meta: DiscoveredMeta;
  path: string;
}

export function loadDiscovered(asset: Asset): DiscoverySnapshot[] {
  return asset.deployments.flatMap((d) => {
    const rel = `discovered/${asset.slug}/${d.chain}.json`;
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) return [];
    const metaFile = path.join(ROOT, `discovered/${asset.slug}/${d.chain}.meta.json`);
    return [
      {
        discovered: parseOrThrow(DiscoveredSchema, readJson(file), file),
        meta: parseOrThrow(DiscoveredMetaSchema, readJson(metaFile), metaFile),
        path: rel,
      },
    ];
  });
}

export function loadMeasured(slug: string): Measured | undefined {
  const file = path.join(ROOT, `data/measured/${slug}.json`);
  if (!fs.existsSync(file)) return undefined;
  return parseOrThrow(MeasuredSchema, readJson(file), file);
}
