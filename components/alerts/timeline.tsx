import { RelativeTime } from "@/components/data/relative-time";
import type { Tone } from "@/lib/framework/types";
import { cn, RISK_DOT } from "@/lib/ui";

export interface TimelineItem {
  id: string;
  date: string;
  color: Tone;
  badge: string;
  title: string;
  body?: string;
  links?: { label: string; href: string }[];
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative ml-1.5 border-l border-line">
      {items.map((item) => (
        <li key={item.id} className="relative pb-6 pl-6 last:pb-0">
          <span
            aria-hidden
            className={cn("absolute top-1.5 -left-[5px] size-2.5 rounded-full ring-4 ring-surface", RISK_DOT[item.color])}
          />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label">
            <span className="font-semibold tracking-wide text-fg-muted uppercase">{item.badge}</span>
            <span className="text-fg-subtle">·</span>
            <RelativeTime iso={item.date} className="font-normal text-fg-subtle" />
          </div>
          <p className="mt-0.5 text-body font-medium text-fg">{item.title}</p>
          {item.body && <p className="mt-0.5 text-small text-fg-muted">{item.body}</p>}
          {item.links && (
            <div className="mt-1 flex flex-wrap gap-3 text-label">
              {item.links.map((l) => (
                <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {l.label} ↗
                </a>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
