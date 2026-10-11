import { assetRows } from "@/lib/rows";

export const dynamic = "force-static";
export const revalidate = 300;

export async function GET() {
  return Response.json(
    { assets: await assetRows() },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=3600" } },
  );
}
