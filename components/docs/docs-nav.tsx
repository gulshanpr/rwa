"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui";

export function DocsNav({ sections }: { sections: { heading: string; items: { label: string; href: string }[] }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Docs" className="sticky top-24 space-y-5">
      {sections.map((s) => (
        <div key={s.heading}>
          <p className="mb-1.5 text-micro text-fg-subtle uppercase">{s.heading}</p>
          <ul className="space-y-0.5">
            {s.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={pathname === i.href ? "page" : undefined}
                  className={cn(
                    "block rounded-control px-2 py-1 text-small",
                    pathname === i.href ? "bg-accent-soft font-medium text-accent" : "text-fg-muted hover:bg-subtle hover:text-fg",
                  )}
                >
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
