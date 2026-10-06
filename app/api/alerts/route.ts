import type { NextRequest } from "next/server";
import { loadAlerts } from "@/lib/data";

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const asset = params.get("asset");
  const severity = params.get("severity");
  const since = params.get("since");
  const { alerts, sample } = loadAlerts();

  const filtered = alerts.filter(
    (a) =>
      (!asset || a.asset === asset) &&
      (!severity || a.severity === severity) &&
      (!since || a.publishedAt >= since),
  );
  return Response.json(
    { sample, alerts: filtered },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=3600" } },
  );
}
