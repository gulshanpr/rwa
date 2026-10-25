import { loadAssets, loadDiscovered, loadEntities, loadLive } from "@/lib/data";
import { rateAsset, CATEGORY_LABELS, CATEGORY_ORDER, type FrameworkRating, type Rating } from "@/lib/framework";
import { loadEntityFacts, loadFrameworks, loadMeasured } from "@/lib/framework/data";

// Rates every asset with the RWAbeat framework (docs/framework.md) and prints the result.
// Usage: bun framework [slug ...] [--json]

const args = process.argv.slice(2);
const json = args.includes("--json");
const only = args.filter((a) => !a.startsWith("--"));

const SHORT: Record<Rating, string> = { green: "green", yellow: "yellow", red: "red", unverified: "unverified", "not-assessed": "—" };

export function rateAll(): FrameworkRating[] {
  const frameworks = loadFrameworks();
  const facts = loadEntityFacts();
  const names = Object.fromEntries([...loadEntities().values()].map((e) => [e.slug, e.name]));
  return loadAssets()
    .filter((a) => only.length === 0 || only.includes(a.slug))
    .flatMap((asset) => {
      const framework = frameworks.get(asset.slug);
      if (!framework) {
        console.error(`${asset.slug}: no data/framework/assets/${asset.slug}.yaml`);
        return [];
      }
      return [
        rateAsset({
          asset,
          framework,
          discovered: loadDiscovered(asset).map((s) => s.discovered),
          live: loadLive(asset.slug),
          measured: loadMeasured(asset.slug),
          entityFacts: facts,
          entityNames: names,
        }),
      ];
    });
}

const ratings = rateAll();
if (json) console.log(JSON.stringify(ratings, null, 2));
else {
  const cell = (r: FrameworkRating, c: (typeof CATEGORY_ORDER)[number]) => {
    const x = r.categories[c];
    return x.rating === "unverified" && x.floor ? `unverified (≥${x.floor})` : SHORT[x.rating];
  };
  const header = ["asset", ...CATEGORY_ORDER.map((c) => CATEGORY_LABELS[c]), "Stage", "Onchain data"];
  const rows = ratings.map((r) => [
    r.asset,
    ...CATEGORY_ORDER.map((c) => cell(r, c)),
    r.stage.stage === null ? "none" : `${r.stage.stage}${r.stage.pendingLegal ? " (legal pending)" : ""}`,
    r.onchainData ? "yes" : "no",
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(line(header));
  for (const row of rows) console.log(line(row));

  for (const r of ratings) {
    console.log(`\n${r.asset}`);
    for (const c of CATEGORY_ORDER) {
      const x = r.categories[c];
      console.log(`  ${CATEGORY_LABELS[c]}: ${cell(r, c)} · ${x.headline}`);
    }
    const next = r.stage.requirements.filter((q) => q.stage === (r.stage.stage === null ? 0 : r.stage.stage + 1) && q.status !== "met");
    if (next.length) console.log(`  Next stage needs: ${next.map((q) => `${q.text}${q.status === "not-assessed" ? " (legal, not assessed)" : ""}`).join("; ")}`);
  }
}
