import { loadAlerts } from "@/lib/data";
import { getProfiles } from "@/lib/profile";
import { SITE } from "@/lib/site";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const tickers = new Map(getProfiles().map((p) => [p.asset.slug, p.asset.ticker]));
  const { alerts } = loadAlerts();

  const items = alerts
    .map((a) => {
      const link = `${origin}/assets/${a.asset}/history`;
      const ticker = tickers.get(a.asset) ?? a.asset.toUpperCase();
      return `    <item>
      <title>${escape(`[${a.severity.toUpperCase()}] ${ticker}: ${a.title}`)}</title>
      <link>${link}</link>
      <guid isPermaLink="false">${escape(a.id)}</guid>
      <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
      <category>${escape(a.kind)}</category>
      <description>${escape(a.consequence)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${SITE.name} alerts</title>
    <link>${origin}/alerts</link>
    <description>Onchain changes to tracked tokenized real-world assets.</description>
${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
