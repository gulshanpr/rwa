import { notFound } from "next/navigation";
import { Timeline, type TimelineItem } from "@/components/alerts/timeline";
import { Card } from "@/components/ui/card";
import { tabMetadata } from "@/lib/asset-meta";
import { explorerTx } from "@/lib/chains";
import { formatNumber } from "@/lib/format";
import { getProfile } from "@/lib/profile";
import { repoFileUrl } from "@/lib/site";
import { SEVERITY_COLOR } from "@/lib/ui";

export const generateMetadata = tabMetadata("History");

export default async function HistoryPage({ params }: PageProps<"/assets/[slug]/history">) {
  const { slug } = await params;
  const profile = getProfile(slug) ?? notFound();

  const items: TimelineItem[] = [
    ...profile.alerts.map((a) => ({
      id: a.id,
      date: a.publishedAt,
      color: SEVERITY_COLOR[a.severity],
      badge: a.severity,
      title: a.title,
      body: a.consequence,
      links: [{ label: "Transaction", href: explorerTx(a.chain, a.txHash) }],
    })),
    ...profile.snapshots.map((s) => ({
      id: `discovery-${s.discovered.chain}-${s.discovered.block}`,
      date: s.discovered.timestamp,
      color: "grey" as const,
      badge: "Discovery",
      title: `Discovery snapshot at block ${formatNumber(s.discovered.block)}`,
      body: "Permissions re-read from chain. Changes since the last snapshot open a pull request for review.",
      links: [{ label: "Snapshot on GitHub", href: repoFileUrl(s.path) }],
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card title="History" description="Alerts and discovery snapshots for this asset, newest first.">
      <Timeline items={items} />
    </Card>
  );
}
