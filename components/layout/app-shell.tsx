"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Menu, PanelLeft, PanelLeftClose, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { SearchItem } from "@/lib/profile";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/ui";
import { CommandSearch } from "./command-search";
import { GithubIcon, LogoMark } from "./logo";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";

export function AppShell({
  children,
  footer,
  searchItems,
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
  searchItems: SearchItem[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <div
        role="note"
        className="flex items-start justify-center gap-2 border-b border-accent/25 bg-accent-soft px-4 py-2 text-small text-fg"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <p>
          <strong className="font-semibold">Under active development.</strong> We&apos;re continuously fixing and
          improving the metrics and parameters, so scores and ratings may change.{" "}
          <Link href="/changelog" className="text-accent underline underline-offset-2">
            See changelog
          </Link>
        </p>
      </div>
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-line bg-surface px-3 md:gap-4 md:px-5">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="inline-flex size-8 items-center justify-center rounded-control text-fg-muted hover:bg-subtle lg:hidden"
        >
          <Menu className="size-5" />
        </button>
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <LogoMark className="size-6" />
          <span className="text-[16px] font-semibold tracking-tight text-fg">{SITE.name}</span>
        </Link>
        <span className="hidden h-5 w-px bg-line md:block" aria-hidden />
        <span className="hidden shrink-0 text-small text-fg-muted md:block">{SITE.tagline}</span>
        <div className="flex min-w-0 flex-1 justify-center">
          <CommandSearch items={searchItems} />
        </div>
        <nav className="flex shrink-0 items-center gap-1">
          <Link
            href="/methodology"
            className="hidden rounded-control px-2.5 py-1.5 text-body text-fg-muted hover:bg-subtle hover:text-fg sm:block"
          >
            Methodology
          </Link>
          <a
            href={SITE.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-body text-fg-muted hover:bg-subtle hover:text-fg"
          >
            <GithubIcon className="size-4" />
            <span className="hidden md:inline">GitHub</span>
          </a>
          <ThemeToggle />
        </nav>
      </header>

      <div className="flex">
        <aside
          className={cn(
            "sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col border-r border-line bg-surface lg:flex",
            collapsed ? "w-16" : "w-16 xl:w-60",
          )}
        >
          <SidebarNav variant={collapsed ? "rail" : "responsive"} />
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-10 items-center justify-center border-t border-line text-fg-subtle hover:text-fg xl:flex"
          >
            {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 md:px-6 md:py-6">{children}</main>
          {footer}
        </div>
      </div>

      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-surface shadow-popover lg:hidden">
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <Dialog.Title className="flex items-center gap-2 font-semibold">
                <LogoMark className="size-6" /> {SITE.name}
              </Dialog.Title>
              <Dialog.Close aria-label="Close navigation" className="rounded-control p-1 text-fg-muted hover:bg-subtle">
                <X className="size-5" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">Site navigation</Dialog.Description>
            <SidebarNav variant="full" onNavigate={() => setMobileOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
