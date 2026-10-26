import { getProfile, getProfiles, type AssetProfile } from "@/lib/profile";

export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = 300;

export async function generateStaticParams() {
  return (await getProfiles()).map((p) => ({ slug: p.asset.slug }));
}

function exportProfile(p: AssetProfile) {
  return {
    sample: p.sample,
    asset: p.asset,
    rating: p.rating,
    measured: p.measured ?? null,
    stats: p.stats,
    flags: p.flags,
    powers: p.powers,
    discovered: p.snapshots.map((s) => ({ ...s.discovered, meta: s.meta })),
    live: p.live ?? null,
    alerts: p.alerts,
  };
}

const HEADERS = { "Cache-Control": "s-maxage=300, stale-while-revalidate=3600" };

export async function GET(_req: Request, ctx: RouteContext<"/api/assets/[slug]">) {
  const { slug } = await ctx.params;
  const profile = (await getProfile(slug));
  if (!profile) return Response.json({ error: "Asset not found" }, { status: 404 });

  return Response.json(exportProfile(profile), { headers: HEADERS });
}
