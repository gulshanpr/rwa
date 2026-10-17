"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { cn } from "@/lib/ui";

const TABS = [
  { segment: null, label: "Overview" },
  { segment: "control", label: "Control" },
  { segment: "pricing", label: "NAV" },
  { segment: "defi", label: "DeFi exposure" },
  { segment: "verification", label: "Reserves" },
  { segment: "exit", label: "Exit" },
  { segment: "disclosure", label: "Disclosure" },
  { segment: "history", label: "History" },
  { segment: "sources", label: "Sources" },
] as const;

export function AssetTabs({ slug }: { slug: string }) {
  const active = useSelectedLayoutSegment();
  return (
    <nav aria-label="Asset sections" className="-mx-4 mb-5 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-5">
        {TABS.map((t) => {
          const isActive = active === t.segment;
          return (
            <li key={t.label}>
              <Link
                href={t.segment ? `/assets/${slug}/${t.segment}` : `/assets/${slug}`}
                aria-current={isActive ? "page" : undefined}
                scroll={false}
                className={cn(
                  "-mb-px block border-b-2 py-2.5 text-body transition-colors",
                  isActive ? "border-accent font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
