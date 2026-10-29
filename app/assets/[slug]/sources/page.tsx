import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { tabMetadata } from "@/lib/asset-meta";
import { formatDate } from "@/lib/format";
import { getProfile } from "@/lib/profile";
import { collectSources, type TabId } from "@/lib/sources";
import { cn } from "@/lib/ui";

export const generateMetadata = tabMetadata("Sources");

const TAB_TITLES: Record<TabId, string> = {
  overview: "Overview",
  underlying: "Underlying Asset",
  legal: "Legal Claim",
  counterparties: "Counterparties",
  control: "Control",
  transparency: "Transparency",
  pricing: "Pricing",
  exit: "Exit",
  defi: "DeFi exposure",
  history: "History",
  sources: "Sources",
};

export default async function SourcesPage({ params }: PageProps<"/assets/[slug]/sources">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const groups = collectSources(profile);
  const order = (Object.keys(TAB_TITLES) as TabId[]).filter((t) => groups[t]?.length);
  const total = order.reduce((n, t) => n + (groups[t]?.length ?? 0), 0);

  return (
    <div className="grid gap-4">
      <p className="text-small text-fg-muted">
        {total} sources cited on this page. Every public curated value must have one; schema validation fails the build otherwise.
      </p>
      {order.map((tab) => (
        <Card key={tab} title={TAB_TITLES[tab]} bodyClassName="p-4 pt-3 md:p-5 md:pt-3">
          {/* Phones get a stacked list: four table columns squeeze long URLs and notes into slivers. */}
          <ul className="divide-y divide-line rounded-control border border-line md:hidden">
            {groups[tab]?.map((s, i) => (
              <li key={`${s.field}-${i}`} className="min-w-0 px-3.5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-small font-medium text-fg first-letter:uppercase">{s.field}</p>
                  {s.checkedAt && <span className="shrink-0 text-label text-fg-subtle">{formatDate(s.checkedAt)}</span>}
                </div>
                <SourceLink url={s.url} tx={s.tx} className="mt-1" />
                {s.note && <p className="mt-1.5 text-small text-fg-muted">{s.note}</p>}
              </li>
            ))}
          </ul>
          <Table className="max-md:hidden">
            <thead>
              <tr>
                <Th>Field</Th>
                <Th>Source</Th>
                <Th>Note</Th>
                <Th align="right">Checked</Th>
              </tr>
            </thead>
            <tbody>
              {groups[tab]?.map((s, i) => (
                <Tr key={`${s.field}-${i}`}>
                  <Td className="whitespace-nowrap first-letter:uppercase">{s.field}</Td>
                  <Td className="max-w-xs">
                    <SourceLink url={s.url} tx={s.tx} />
                  </Td>
                  <Td className="text-fg-muted">{s.note ?? "—"}</Td>
                  <Td align="right" className="whitespace-nowrap text-fg-muted">
                    {s.checkedAt ? formatDate(s.checkedAt) : "—"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ))}
    </div>
  );
}

/** One line: the URL without its scheme, cut off with an ellipsis; the full address is in the tooltip and the link. */
function SourceLink({ url, tx, className }: { url?: string; tx?: string; className?: string }) {
  if (!url) return <code className={cn("block truncate font-mono text-[12px]", className)} title={tx}>{tx}</code>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={url} className={cn("flex min-w-0 items-center gap-1 text-small text-accent hover:underline", className)}>
      <span className="truncate">{url.replace(/^https?:\/\/(www\.)?/, "")}</span>
      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
    </a>
  );
}
