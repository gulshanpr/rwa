import { assetRows, rowsToCsv } from "@/lib/rows";

export const dynamic = "force-static";
export const revalidate = 300;

export function GET() {
  return new Response(rowsToCsv(assetRows()), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="rwabeat-assets.csv"',
      "Cache-Control": "s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
