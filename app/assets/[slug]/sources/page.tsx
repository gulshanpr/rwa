import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { tabMetadata } from "@/lib/asset-meta";
import { formatDate } from "@/lib/format";
import { getProfile } from "@/lib/profile";
import type { TabId } from "@/lib/scoring/types";
import { collectSources } from "@/lib/sources";

export const generateMetadata = tabMetadata("Sources");

const TAB_TITLES: Record<TabId, string> = {
  overview: "Overview",
  control: "Control",
  pricing: "NAV",
  defi: "DeFi exposure",
  verification: "Reserves",
  exit: "Exit",
  disclosure: "Disclosure",
  history: "History",
  sources: "Sources",
};

export default async function SourcesPage({ params }: PageProps<"/assets/[slug]/sources">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const groups = collectSources(profile);
  const order = (Object.keys(TAB_TITLES) as TabId[]).filter((t) => groups[t]?.length);
  const total = order.reduce((n, t) => n + groups[t].length, 0);

  return (
    <div className="grid gap-4">
      <p className="text-small text-fg-muted">
        {total} sources cited on this page. Every public curated value must have one; schema validation fails the build otherwise.
      </p>
      {order.map((tab) => (
        <Card key={tab} title={TAB_TITLES[tab]} bodyClassName="p-4 pt-3 md:p-5 md:pt-3">
          <Table>
            <thead>
              <tr>
                <Th>Field</Th>
                <Th>Source</Th>
                <Th>Note</Th>
                <Th align="right">Checked</Th>
              </tr>
            </thead>
            <tbody>
              {groups[tab].map((s, i) => (
                <Tr key={`${s.field}-${i}`}>
                  <Td className="whitespace-nowrap first-letter:uppercase">{s.field}</Td>
                  <Td className="max-w-md">
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="break-all text-accent hover:underline">
                        {s.url.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      <code className="font-mono text-[12px]">{s.tx}</code>
                    )}
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
