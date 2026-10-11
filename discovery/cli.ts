import fs from "node:fs";
import path from "node:path";
import { loadAssets } from "@/lib/data";
import type { Chain } from "@/lib/schema/asset";
import { diffSummary, discover, readPrevious, sameContent, write } from "./discover";

const USAGE = `Usage:
  bun run discover <slug>                 all deployments of one asset
  bun run discover <slug> --chain <chain>
  bun run discover --all                  every asset (nightly job)
  bun run discover <slug> --dry-run       print the diff without writing`;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const slug = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--chain");
const all = flag("--all");
const dryRun = flag("--dry-run");
const onlyChain = option("--chain") as Chain | undefined;

if (!slug && !all) {
  console.error(USAGE);
  process.exit(1);
}

const assets = loadAssets().filter((a) => all || a.slug === slug);
if (assets.length === 0) {
  console.error(`No asset "${slug}" in data/assets/.`);
  process.exit(1);
}

const summary: string[] = [];
let changed = 0;
let failed = 0;

for (const asset of assets) {
  for (const d of asset.deployments) {
    if (onlyChain && d.chain !== onlyChain) continue;
    const label = `${asset.slug}/${d.chain}`;
    console.error(`Discovering ${label}…`);
    try {
      const result = await discover(asset, d.chain);
      const prev = readPrevious(asset.slug, d.chain);
      if (sameContent(prev, result.discovered)) {
        console.error(`  ${label}: no changes at block ${result.meta.block}.`);
        continue;
      }
      const lines = diffSummary(prev, result.discovered);
      changed++;
      summary.push(`### ${label} at block ${result.meta.block}`, ...lines.map((l) => `- ${l}`), "");
      console.error(lines.map((l) => `  ${l}`).join("\n"));
      if (result.extra.dsRoles) console.error(`  DS roles: ${JSON.stringify(result.extra.dsRoles)}`);
      if (!dryRun) write(result);
    } catch (e) {
      failed++;
      console.error(`  ${label} failed: ${e instanceof Error ? e.message : String(e)}`);
      summary.push(`### ${label}`, `- Discovery failed: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`, "");
    }
  }
}

const out = path.join(process.cwd(), ".cache", "discovery-summary.md");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, summary.length > 0 ? summary.join("\n") : "No changes.\n");
console.error(`\n${changed} snapshot(s) changed${dryRun ? " (dry run, nothing written)" : ""}, ${failed} failed. Summary: .cache/discovery-summary.md`);
if (failed > 0) process.exit(1);
