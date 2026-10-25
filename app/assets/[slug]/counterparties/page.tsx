import { notFound } from "next/navigation";
import { EmptyUnknown } from "@/components/data/empty-unknown";
import { SourceMarker } from "@/components/data/source-marker";
import { CategoryCard } from "@/components/risk/category-card";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Tag } from "@/components/ui/tag";
import { tabMetadata } from "@/lib/asset-meta";
import { RAIL_LABELS } from "@/lib/framework/counterparties";
import { getProfile, nameOf } from "@/lib/profile";
import type { Role } from "@/lib/schema/asset";

export const generateMetadata = tabMetadata("Counterparties");

const ROLES: { role: Role; key: "custodian" | "fundAdministrator" | "auditor" | "transferAgent"; label: string }[] = [
  { role: "custodian", key: "custodian", label: "Custodian" },
  { role: "fund-administrator", key: "fundAdministrator", label: "Fund administrator" },
  { role: "auditor", key: "auditor", label: "Auditor" },
  { role: "transfer-agent", key: "transferAgent", label: "Transfer agent" },
];

const TIER_LABELS = {
  "big-four": "Big Four",
  "pcaob-registered": "PCAOB-registered",
  "global-network": "Major international network",
  other: "Small firm",
} as const;

export default async function CounterpartiesPage({ params }: PageProps<"/assets/[slug]/counterparties">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, rating } = profile;
  const cp = asset.counterparties;

  return (
    <div className="grid gap-4">
      <CategoryCard result={rating.categories.counterparties} slug={slug} />

      <Card title="Service providers" description="Who holds, values, audits and registers the assets, and whether they answer to a regulator.">
        <Table>
          <thead>
            <tr>
              <Th>Role</Th>
              <Th>Firm</Th>
              <Th>Independent of issuer</Th>
              <Th>Regulated</Th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map(({ role, key, label }) => {
              const item = cp[key];
              const entity = item.status === "public" ? profile.entityInfo[item.value] : undefined;
              const tier = entity?.auditorTier;
              return (
                <Tr key={role}>
                  <Td className="font-medium whitespace-nowrap">{label}</Td>
                  <Td>
                    {item.status === "public" ? (
                      <>
                        {nameOf(profile, item.value)}
                        <SourceMarker source={item.source} />
                      </>
                    ) : (
                      <EmptyUnknown topic={`${asset.ticker} ${label.toLowerCase()}`} searchedAt={item.status === "not_public" ? item.searchedAt : undefined} note={item.note} />
                    )}
                  </Td>
                  <Td>
                    {item.status !== "public" ? (
                      <span className="text-fg-subtle">—</span>
                    ) : cp.affiliated.value.includes(role) ? (
                      <Tag variant="risk-red">Issuer&apos;s group</Tag>
                    ) : (
                      <span className="text-fg-muted">Yes</span>
                    )}
                  </Td>
                  <Td className="text-fg-muted">
                    {role === "auditor" ? (
                      tier ? (
                        <>
                          {TIER_LABELS[tier.value]}
                          <SourceMarker source={tier.source} />
                        </>
                      ) : (
                        <span className="text-fg-subtle">{item.status === "public" ? "Not recorded" : "—"}</span>
                      )
                    ) : entity?.regulated ? (
                      <>
                        {entity.regulated.value ? `Yes${entity.regulator ? `, ${entity.regulator}` : ""}` : "No"}
                        <SourceMarker source={entity.regulated.source} />
                      </>
                    ) : (
                      <span className="text-fg-subtle">{item.status === "public" ? "Not recorded" : "—"}</span>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Settlement rails" description="How subscription and redemption money moves. One rail is a single point of failure.">
          <div className="flex flex-wrap gap-1.5">
            {cp.settlementRails.value.map((r) => (
              <Tag key={r}>{RAIL_LABELS[r]}</Tag>
            ))}
            <SourceMarker source={cp.settlementRails.source} />
          </div>
        </Card>
        <Card title="Other parties holders depend on">
          {cp.operators.length === 0 && cp.dependencies.length === 0 ? (
            <p className="text-small text-fg-muted">None recorded.</p>
          ) : (
            <ul className="space-y-2">
              {cp.operators.map((o) => (
                <li key={`${o.role}-${o.name}`} className="text-small">
                  <span className="text-fg-muted">{o.role}:</span> {o.name}
                  <SourceMarker source={o.source} />
                </li>
              ))}
              {cp.dependencies.map((d) => (
                <li key={d.name} className="text-small">
                  <Tag variant="risk-yellow">Dependency</Tag> <span className="text-fg">{d.what}</span>
                  <SourceMarker source={d.source} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
