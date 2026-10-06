import type { Disclosed, Source } from "@/lib/schema/sourced";
import { EmptyUnknown } from "./empty-unknown";
import { SourceMarker } from "./source-marker";

export interface Fact {
  label: string;
  value: React.ReactNode;
  source?: Source;
}

export function FactList({ facts }: { facts: Fact[] }) {
  return (
    <dl className="divide-y divide-line">
      {facts.map((f) => (
        <div key={f.label} className="grid grid-cols-[minmax(0,40%)_1fr] gap-3 py-2 first:pt-0 last:pb-0">
          <dt className="text-small text-fg-muted">{f.label}</dt>
          <dd className="min-w-0 text-small text-fg">
            {f.value}
            {f.source && <SourceMarker source={f.source} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function disclosedFact<T>(
  label: string,
  item: Disclosed<T>,
  render: (value: T) => React.ReactNode = (v) => String(v),
): Fact {
  if (item.status === "public") return { label, value: render(item.value), source: item.source };
  return {
    label,
    value: (
      <EmptyUnknown
        topic={label}
        searchedAt={item.status === "not_public" ? item.searchedAt : undefined}
        note={item.note}
      />
    ),
  };
}
