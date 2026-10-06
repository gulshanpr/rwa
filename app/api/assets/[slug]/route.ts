import { getProfile, getProfiles, type AssetProfile } from "@/lib/profile";
import { csvCell } from "@/lib/rows";

export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = 300;

export function generateStaticParams() {
  return getProfiles().flatMap((p) => [{ slug: p.asset.slug }, { slug: `${p.asset.slug}.csv` }]);
}

function exportProfile(p: AssetProfile) {
  return {
    sample: p.sample,
    asset: p.asset,
    score: p.score,
    stats: p.stats,
    flags: p.flags,
    powers: p.powers,
    discovered: p.snapshots.map((s) => ({ ...s.discovered, meta: s.meta })),
    live: p.live ?? null,
    alerts: p.alerts,
  };
}

function flatten(value: unknown, prefix: string, out: [string, string][]) {
  if (value === null || value === undefined) return;
  if (typeof value !== "object") {
    out.push([prefix, String(value)]);
    return;
  }
  for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
}

const HEADERS = { "Cache-Control": "s-maxage=300, stale-while-revalidate=3600" };

export async function GET(_req: Request, ctx: RouteContext<"/api/assets/[slug]">) {
  const { slug: raw } = await ctx.params;
  const csv = raw.endsWith(".csv");
  const slug = csv ? raw.slice(0, -4) : raw;
  const profile = getProfile(slug);
  if (!profile) return Response.json({ error: "Asset not found" }, { status: 404 });

  const data = exportProfile(profile);
  if (!csv) return Response.json(data, { headers: HEADERS });

  const rows: [string, string][] = [];
  flatten(data, "", rows);
  const body = ["field,value", ...rows.map(([k, v]) => `${csvCell(k)},${csvCell(v)}`)].join("\n") + "\n";
  return new Response(body, {
    headers: {
      ...HEADERS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rwabeat-${slug}.csv"`,
    },
  });
}
