"use client";

import { Command } from "cmdk";
import { FileText, Hexagon, KeyRound, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SearchItem } from "@/lib/profile";

const PAGES: SearchItem[] = [
  { id: "p-screener", kind: "page", title: "Risk screener", subtitle: "All assets", href: "/screener", keywords: "screener table filter" },
  { id: "p-alerts", kind: "page", title: "Alerts", subtitle: "Onchain changes", href: "/alerts", keywords: "alerts feed changes" },
  { id: "p-method", kind: "page", title: "Methodology", subtitle: "How we score", href: "/methodology", keywords: "methodology scoring rules framework" },
  { id: "p-learn", kind: "page", title: "Learn", subtitle: "Glossary", href: "/learn", keywords: "glossary learn spv timelock multisig" },
];

const ICON = { asset: Hexagon, address: KeyRound, page: FileText };

export function CommandSearch({ items }: { items: SearchItem[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const groups: { heading: string; items: SearchItem[] }[] = [
    { heading: "Assets", items: items.filter((i) => i.kind === "asset") },
    { heading: "Addresses", items: items.filter((i) => i.kind === "address") },
    { heading: "Pages", items: PAGES },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-xl items-center gap-2 rounded-control border border-line bg-page px-3 text-body text-fg-subtle hover:border-line-strong"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">
          <span className="sm:hidden">Search…</span>
          <span className="hidden sm:inline">Search asset, issuer, address…</span>
        </span>
        <kbd className="hidden rounded border border-line bg-surface px-1.5 font-sans text-label text-fg-muted sm:inline">⌘K</kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Search"
        overlayClassName="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px]"
        contentClassName="fixed top-[12vh] left-1/2 z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-card border border-line bg-surface shadow-popover"
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 text-fg-subtle" aria-hidden />
          <Command.Input
            autoFocus
            placeholder="Search asset, issuer, or paste an address…"
            className="h-12 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-subtle"
          />
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-small text-fg-muted">
            No matches. Addresses must belong to a tracked asset.
          </Command.Empty>
          {groups.map((g) => (
            <Command.Group
              key={g.heading}
              heading={g.heading}
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-micro [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:uppercase"
            >
              {g.items.map((item) => {
                const Icon = ICON[item.kind];
                return (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    keywords={[item.title, item.subtitle, item.keywords]}
                    onSelect={() => go(item.href)}
                    className="flex cursor-pointer items-center gap-3 rounded-control px-2 py-2 data-[selected=true]:bg-accent-soft"
                  >
                    <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate text-body text-fg">{item.title}</p>
                      <p className="truncate text-label text-fg-muted">{item.subtitle}</p>
                    </div>
                  </Command.Item>
                );
              })}
            </Command.Group>
          ))}
        </Command.List>
      </Command.Dialog>
    </>
  );
}
