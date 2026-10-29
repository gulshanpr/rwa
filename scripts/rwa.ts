import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { closeDb, hasDatabase } from "@/db/client";
import { saveAsset, saveEntity, saveResearchNote, saveSnapshot, stableJson } from "@/db/catalog-store";
import { serialize, snapshotPaths } from "@/discovery/discover";
import { catalogFromDb, catalogFromFiles, type Catalog } from "@/lib/catalog";
import type { Asset } from "@/lib/schema/asset";
import type { Entity } from "@/lib/schema/entity";

const USAGE = `Usage:
  bun rwa import [--by <name>]   load data/, discovered/ and research/ into Postgres (only changes are written)
  bun rwa export [--prune]       write Postgres back to data/ and discovered/ (--prune deletes files not in the database)
  bun rwa check                  list differences between Postgres and the files; exits 1 if they differ`;

const ROOT = process.cwd();
const HEADER =
  "# Synced with Postgres. Edit in /admin and run `bun rwa export`, or edit here and run `bun rwa import`.\n";

const args = process.argv.slice(2);
const command = args[0];
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function whoAmI(): string {
  try {
    return execSync("git config user.email", { encoding: "utf8" }).trim() || "import";
  } catch {
    return "import";
  }
}

/** Matches the hand-written style: one-line source maps, quoted URLs and addresses, a blank line between sections. */
function toYaml(value: unknown): string {
  const doc = new YAML.Document(value);
  const flat = (n: unknown) => YAML.isScalar(n) || (YAML.isSeq(n) && n.items.every((i) => YAML.isScalar(i)));
  YAML.visit(doc, {
    Pair(_, pair) {
      if (!YAML.isScalar(pair.key)) return;
      const key = pair.key.value;
      if ((key === "source" || key === "feed") && YAML.isMap(pair.value)) {
        pair.value.flow = true;
        for (const p of pair.value.items)
          if (
            YAML.isScalar(p.value) &&
            typeof p.value.value === "string" &&
            YAML.isScalar(p.key) &&
            p.key.value !== "checkedAt" &&
            p.key.value !== "chain"
          )
            p.value.type = "QUOTE_DOUBLE";
      }
      if (key === "value" && YAML.isMap(pair.value) && pair.value.items.every((p) => flat(p.value)))
        pair.value.flow = true;
      if (key === "description" && YAML.isScalar(pair.value)) pair.value.type = "BLOCK_FOLDED";
      if (YAML.isSeq(pair.value) && pair.value.items.every((i) => YAML.isScalar(i))) pair.value.flow = true;
    },
    Scalar(_, node) {
      if (typeof node.value === "string" && node.value.startsWith("0x")) node.type = "QUOTE_DOUBLE";
    },
  });
  if (YAML.isMap(doc.contents)) {
    for (const pair of doc.contents.items.slice(1))
      if (YAML.isCollection(pair.value) && !pair.value.flow && YAML.isScalar(pair.key)) pair.key.spaceBefore = true;
  }
  return HEADER + doc.toString({ lineWidth: 0 }).replace(/\[ ([^[\]"]*) \]/g, "[$1]");
}

function assetForYaml(a: Asset): unknown {
  const { sample, ...rest } = a;
  return sample ? a : rest;
}

function entityForYaml(e: Entity): unknown {
  return {
    slug: e.slug,
    name: e.name,
    type: e.type,
    jurisdiction: e.jurisdiction,
    lei: e.lei,
    website: e.website,
    regulated: e.regulated,
    regulator: e.regulator,
    auditorTier: e.auditorTier,
  };
}

async function runImport() {
  const by = option("--by") ?? whoAmI();
  const files = catalogFromFiles();
  let entities = 0;
  for (const e of files.entities.values()) if (await saveEntity(e)) entities++;
  console.log(`entities: ${entities} changed of ${files.entities.size}`);

  for (const asset of files.assets) {
    const r = await saveAsset(asset, by);
    const parts = [
      r.created ? "created" : `${r.factsChanged.length} fact(s) changed`,
      r.factsRemoved.length ? `${r.factsRemoved.length} removed` : "",
    ].filter(Boolean);
    console.log(
      `${asset.slug}: ${parts.join(", ")}${r.factsChanged.length && !r.created ? ` (${r.factsChanged.join(", ")})` : ""}`,
    );
    for (const snap of files.snapshots.get(asset.slug) ?? []) {
      const added = await saveSnapshot(snap.discovered, snap.meta, { by });
      console.log(`  ${snap.discovered.chain} snapshot at block ${snap.meta.block}: ${added ? "stored" : "unchanged"}`);
    }
    const research = path.join(ROOT, "research", `${asset.slug}.md`);
    if (
      fs.existsSync(research) &&
      (await saveResearchNote(asset.slug, "phase-0", fs.readFileSync(research, "utf8"), by))
    )
      console.log(`  research note stored`);
  }
}

function write(file: string, contents: string): boolean {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === contents) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return true;
}

async function requireDb(): Promise<Catalog> {
  if (!hasDatabase()) throw new Error("DATABASE_URL is not set.");
  const db = await catalogFromDb();
  if (!db) throw new Error("The catalog tables are empty. Run `bun rwa import` first.");
  return db;
}

async function runExport() {
  const db = await requireDb();
  const written: string[] = [];
  const keep = new Set<string>();
  const out = (rel: string, contents: string) => {
    keep.add(rel);
    if (write(path.join(ROOT, rel), contents)) written.push(rel);
  };
  for (const e of db.entities.values()) out(`data/entities/${e.slug}.yaml`, toYaml(entityForYaml(e)));
  for (const a of db.assets) {
    out(`data/assets/${a.slug}.yaml`, toYaml(assetForYaml(a)));
    for (const snap of db.snapshots.get(a.slug) ?? []) {
      const p = snapshotPaths(a.slug, snap.discovered.chain);
      out(path.relative(ROOT, p.file), serialize(snap.discovered));
      out(path.relative(ROOT, p.meta), JSON.stringify(snap.meta, null, 2) + "\n");
    }
  }
  const existing = ["data/assets", "data/entities"].flatMap((dir) =>
    fs.existsSync(path.join(ROOT, dir))
      ? fs
          .readdirSync(path.join(ROOT, dir))
          .filter((f) => f.endsWith(".yaml"))
          .map((f) => `${dir}/${f}`)
      : [],
  );
  const extra = existing.filter((f) => !keep.has(f));
  if (args.includes("--prune")) extra.forEach((f) => fs.rmSync(path.join(ROOT, f)));
  console.log(
    written.length ? `wrote ${written.length} file(s):\n  ${written.join("\n  ")}` : "files already match the database",
  );
  if (extra.length)
    console.log(
      `${args.includes("--prune") ? "deleted" : "not in the database (use --prune to delete)"}:\n  ${extra.join("\n  ")}`,
    );
}

async function runCheck(): Promise<number> {
  const db = await requireDb();
  const files = catalogFromFiles();
  const diffs: string[] = [];
  const compare = <T>(kind: string, a: Map<string, T>, b: Map<string, T>) => {
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      if (!a.has(k)) diffs.push(`${kind} ${k}: only in files`);
      else if (!b.has(k)) diffs.push(`${kind} ${k}: only in the database`);
      else if (stableJson(a.get(k)).toLowerCase() !== stableJson(b.get(k)).toLowerCase())
        diffs.push(`${kind} ${k}: differs`);
    }
  };
  compare("asset", new Map(db.assets.map((a) => [a.slug, a])), new Map(files.assets.map((a) => [a.slug, a])));
  compare("entity", db.entities, files.entities);
  const snaps = (c: Catalog) =>
    new Map(
      [...c.snapshots.values()]
        .flat()
        .map((s) => [
          `${s.discovered.asset}/${s.discovered.chain}`,
          { c: s.discovered.contracts, h: s.discovered.holders, block: s.meta.block },
        ]),
    );
  compare("snapshot", snaps(db), snaps(files));
  console.log(diffs.length ? diffs.join("\n") : "database and files are in sync");
  return diffs.length ? 1 : 0;
}

let code = 0;
try {
  if (command === "import") await runImport();
  else if (command === "export") await runExport();
  else if (command === "check") code = await runCheck();
  else {
    console.error(USAGE);
    code = 1;
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  code = 1;
} finally {
  if (hasDatabase()) await closeDb();
}
process.exit(code);
