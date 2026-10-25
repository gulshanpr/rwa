import fs from "node:fs";
import path from "node:path";
import { loadAlerts, loadAssets, loadDiscovered, loadEntities, loadLive } from "@/lib/data";
import { loadEntityFacts, loadFrameworks, loadMeasured } from "@/lib/framework/data";

const STALE_DAYS = 90;
const errors: string[] = [];
const warnings: string[] = [];

function walkDates(value: unknown, at: string, out: { path: string; date: string }[]) {
  if (Array.isArray(value)) value.forEach((v, i) => walkDates(v, `${at}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if ((k === "checkedAt" || k === "searchedAt") && typeof v === "string") out.push({ path: `${at}.${k}`, date: v });
      else walkDates(v, `${at}.${k}`, out);
    }
  }
}

function run() {
  const assets = loadAssets();
  const entities = loadEntities();
  loadAlerts();

  for (const asset of assets) {
    const file = `data/assets/${asset.slug}.yaml`;
    const refs: [string, string][] = [
      ["issuer", asset.issuer],
      ["manager", asset.manager],
      ["platform", asset.platform],
    ];
    for (const [role, item] of Object.entries(asset.serviceProviders)) {
      if (item.status === "public") refs.push([`serviceProviders.${role}`, item.value]);
    }
    if (asset.pricing.reference.type !== "none") refs.push(["pricing.reference.provider", asset.pricing.reference.provider]);
    asset.verification.methods.forEach((m, i) => refs.push([`verification.methods[${i}].provider`, m.provider]));
    for (const [field, slug] of refs) {
      if (!entities.has(slug)) errors.push(`${file}: ${field} "${slug}" has no data/entities/${slug}.yaml`);
    }

    for (const d of asset.deployments) {
      const rel = `discovered/${asset.slug}/${d.chain}.json`;
      if (!fs.existsSync(path.join(process.cwd(), rel))) warnings.push(`${file}: no discovery snapshot at ${rel}. Run: bun run discover ${asset.slug}`);
    }
    loadDiscovered(asset);
    loadLive(asset.slug);

    const dates: { path: string; date: string }[] = [];
    walkDates(asset, asset.slug, dates);
    const cutoff = Date.now() - STALE_DAYS * 86400 * 1000;
    for (const d of dates) {
      if (new Date(d.date).getTime() < cutoff) warnings.push(`${file}: ${d.path} = ${d.date} is older than ${STALE_DAYS} days. Re-check the source.`);
    }
  }

  validateFramework(assets.map((a) => a.slug), entities);
  return assets.length;
}

/** data/framework: one file per asset, entity references resolve, sources aren't stale. */
function validateFramework(slugs: string[], entities: Map<string, unknown>) {
  const frameworks = loadFrameworks();
  const facts = loadEntityFacts();
  for (const slug of slugs) if (!frameworks.has(slug)) errors.push(`data/framework/assets/${slug}.yaml is missing`);
  for (const [slug, fw] of frameworks) {
    const file = `data/framework/assets/${slug}.yaml`;
    if (!slugs.includes(slug)) errors.push(`${file}: no data/assets/${slug}.yaml`);
    const { custodian, fundAdministrator, auditor } = fw.counterparties;
    for (const [role, item] of Object.entries({ custodian, fundAdministrator, auditor })) {
      if (item.status === "public" && !entities.has(item.value) && !facts.get(item.value)?.name)
        errors.push(`${file}: counterparties.${role} "${item.value}" has no data/entities file and no name in data/framework/entities.yaml`);
    }
    loadMeasured(slug);
    const dates: { path: string; date: string }[] = [];
    walkDates(fw, slug, dates);
    const cutoff = Date.now() - STALE_DAYS * 86400 * 1000;
    for (const d of dates) {
      if (new Date(d.date).getTime() < cutoff) warnings.push(`${file}: ${d.path} = ${d.date} is older than ${STALE_DAYS} days. Re-check the source.`);
    }
  }
}

let count = 0;
try {
  count = run();
} catch (e) {
  errors.push(e instanceof Error ? e.message : String(e));
}

const ci = Boolean(process.env.GITHUB_ACTIONS);
for (const w of warnings) console.log(ci ? `::warning::${w}` : `warning: ${w}`);
for (const e of errors) console.log(ci ? `::error::${e}` : `error: ${e}`);
if (errors.length > 0) process.exit(1);
console.log(`Validated ${count} asset(s), ${warnings.length} warning(s).`);
