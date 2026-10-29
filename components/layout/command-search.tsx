"use client";

import { Command } from "cmdk";
import { CornerDownLeft, FileText, KeyRound, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AssetLogo } from "@/components/asset/asset-logo";
import { formatUsd, shortAddress } from "@/lib/format";
import type { SearchAsset, SearchIndex } from "@/lib/profile";

const PAGES = [
  { title: "Risk screener", href: "/screener", terms: "screener assets table filter compare" },
  { title: "Alerts", href: "/alerts", terms: "alerts feed changes upgrades" },
  { title: "Methodology", href: "/methodology", terms: "methodology scoring rules framework stages" },
  { title: "Changelog", href: "/changelog", terms: "changelog updates history" },
];

/** Addresses shown for a word search; a pasted address gets more room. */
const ADDRESS_LIMIT = 6;
const HEX_LIMIT = 20;

type Result =
  | { kind: "asset"; id: string; href: string; asset: SearchAsset }
  | { kind: "address"; id: string; href: string; address: string; title: string; detail: string }
  | { kind: "page"; id: string; href: string; title: string };

/** Higher is better; 0 is no match. Word starts beat matches mid-word. */
function scoreText(text: string, q: string): number {
  const t = text.toLowerCase();
  if (t === q) return 4;
  if (t.startsWith(q)) return 3;
  if (t.includes(` ${q}`) || t.includes(`(${q}`)) return 2;
  return t.includes(q) ? 1 : 0;
}

function search(index: SearchIndex, raw: string): { groups: { heading: string; items: Result[] }[]; more: number } {
  const q = raw.trim().toLowerCase();
  const assetResult = (a: SearchAsset): Result => ({ kind: "asset", id: `asset-${a.slug}`, href: `/assets/${a.slug}`, asset: a });
  const pageResult = (p: (typeof PAGES)[number]): Result => ({ kind: "page", id: `page-${p.href}`, href: p.href, title: p.title });

  // Nothing typed: assets by value and the main pages. Addresses only appear once there's something to match.
  if (!q) return { groups: [{ heading: "Assets", items: index.assets.map(assetResult) }, { heading: "Pages", items: PAGES.map(pageResult) }], more: 0 };

  const assets = index.assets
    .map((a, i) => ({ a, i, score: Math.max(scoreText(a.ticker, q) * 3, scoreText(a.name, q) * 2, a.terms.includes(q) ? 1 : 0) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || x.i - y.i)
    .map((x) => assetResult(x.a));

  const hex = /^0x[0-9a-f]*$/.test(q) || (q.length >= 6 && /^[0-9a-f]+$/.test(q));
  const needle = hex ? q.replace(/^0x/, "") : q;
  const addressHits = index.addresses
    .map(([address, label, role, i]) => {
      const asset = index.assets[i];
      // Many labels start with the ticker ("BUIDL TokenIssuer"); typing a ticker should find the asset, not its contracts.
      const prefix = `${asset.ticker.toLowerCase()} `;
      const own = label?.toLowerCase().startsWith(prefix) ? label.slice(prefix.length) : label;
      const score = hex
        ? needle.length >= 2 && address.toLowerCase().includes(needle)
          ? address.toLowerCase().startsWith(`0x${needle}`) ? 2 : 1
          : 0
        : q.length >= 2
          ? Math.max(own ? scoreText(own, q) : 0, scoreText(role, q))
          : 0;
      return { address, label, role, asset, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);
  const limit = hex ? HEX_LIMIT : ADDRESS_LIMIT;
  const addresses: Result[] = addressHits.slice(0, limit).map((x) => ({
    kind: "address",
    id: `addr-${x.asset.slug}-${x.address.toLowerCase()}`,
    href: `/assets/${x.asset.slug}/control#addr-${x.address.toLowerCase()}`,
    address: x.address,
    title: x.label ?? x.role,
    detail: [shortAddress(x.address), x.label ? x.role : null, x.asset.ticker].filter(Boolean).join(" · "),
  }));

  const pages = PAGES.filter((p) => scoreText(p.title, q) >= 2 || scoreText(p.terms, q) >= 2).map(pageResult);

  const groups = [
    { heading: "Assets", items: assets },
    { heading: "Addresses", items: addresses },
    { heading: "Pages", items: pages },
  ];
  // A pasted address is almost always looking for an address.
  if (hex) groups.unshift(...groups.splice(1, 1));
  return { groups: groups.filter((g) => g.items.length > 0), more: Math.max(0, addressHits.length - limit) };
}

const subscribeNoop = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

export function CommandSearch({ items }: { items: SearchIndex }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const router = useRouter();
  // null on the server, so the shortcut hint only renders once the platform is known.
  const mac = useSyncExternalStore(subscribeNoop, isMac, () => null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { groups, more } = search(items, query);
  // Keep a result highlighted: the first one whenever the list changes under the current pick.
  const ids = groups.flatMap((g) => g.items.map((r) => r.id));
  const active = ids.includes(selected) ? selected : (ids[0] ?? "");

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };
  const go = (href: string) => {
    changeOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-control border border-line bg-page px-3 text-body text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">Search assets or addresses</span>
        {mac !== null && (
          <kbd className="hidden rounded border border-line bg-surface px-1.5 font-sans text-label text-fg-muted sm:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
        )}
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={changeOpen}
        label="Search"
        shouldFilter={false}
        value={active}
        onValueChange={setSelected}
        overlayClassName="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px]"
        contentClassName="fixed top-3 left-1/2 z-50 w-[calc(100vw-1.5rem)] max-w-[600px] -translate-x-1/2 overflow-hidden rounded-card border border-line bg-surface shadow-popover sm:top-[12vh]"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Ticker, issuer, or paste an address"
            className="h-12 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-subtle"
          />
          <kbd className="hidden rounded border border-line px-1.5 font-sans text-label text-fg-subtle sm:inline">esc</kbd>
        </div>
        <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto overscroll-contain p-1.5">
          <Command.Empty className="px-3 py-8 text-center text-small text-fg-muted">
            No results for “{query.trim()}”.
            {query.trim().toLowerCase().startsWith("0x") && (
              <span className="mt-1 block text-label text-fg-subtle">Only addresses that belong to a tracked asset are searchable.</span>
            )}
          </Command.Empty>
          {groups.map((g) => (
            <Command.Group
              key={g.heading}
              heading={g.heading}
              className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-micro [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:uppercase"
            >
              {g.items.map((r) => (
                <Command.Item
                  key={r.id}
                  value={r.id}
                  onSelect={() => go(r.href)}
                  className="group flex cursor-pointer items-center gap-3 rounded-control px-2.5 py-2 data-[selected=true]:bg-accent-soft"
                >
                  {r.kind === "asset" ? (
                    <>
                      <AssetLogo slug={r.asset.slug} ticker={r.asset.ticker} size={22} />
                      <p className="min-w-0 flex-1 truncate text-body">
                        <span className="font-medium text-fg">{r.asset.ticker}</span>
                        <span className="ml-2 text-small text-fg-muted">{r.asset.name}</span>
                      </p>
                      {r.asset.aumUsd !== null && <span className="tnum shrink-0 text-small text-fg-subtle">{formatUsd(r.asset.aumUsd)}</span>}
                    </>
                  ) : r.kind === "address" ? (
                    <>
                      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-subtle">
                        <KeyRound className="size-3 text-fg-muted" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body text-fg">{r.title}</p>
                        <p className="truncate font-mono text-label text-fg-muted">{r.detail}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-subtle">
                        <FileText className="size-3 text-fg-muted" aria-hidden />
                      </span>
                      <p className="min-w-0 flex-1 truncate text-body text-fg">{r.title}</p>
                    </>
                  )}
                  <CornerDownLeft className="hidden size-3.5 shrink-0 text-fg-subtle sm:group-data-[selected=true]:block" aria-hidden />
                </Command.Item>
              ))}
            </Command.Group>
          ))}
          {more > 0 && <p className="px-2.5 pt-1 pb-2 text-label text-fg-subtle">{more} more addresses match. Type more to narrow it down.</p>}
        </Command.List>
      </Command.Dialog>
    </>
  );
}
