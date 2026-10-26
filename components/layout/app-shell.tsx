"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Menu, PanelLeft, PanelLeftClose, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SIDEBAR_COLLAPSED_KEY, SIDEBAR_MAX, SIDEBAR_MIN, SIDEBAR_WIDTH_KEY } from "@/lib/sidebar";
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
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-16 shrink-0 flex-col border-r border-line bg-surface lg:flex xl:expanded:w-(--sidebar-w)">
          <SidebarNav variant="responsive" />
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            className="hidden h-10 items-center justify-center border-t border-line text-fg-subtle hover:text-fg xl:flex"
          >
            <PanelLeft className="size-4 expanded:hidden" />
            <PanelLeftClose className="hidden size-4 expanded:block" />
          </button>
          <SidebarResizeHandle />
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

function toggleSidebar() {
  const collapsed = document.documentElement.classList.toggle("sidebar-collapsed");
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {}
}

function setSidebarWidth(px: number, persist: boolean) {
  const w = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, px)));
  document.documentElement.style.setProperty("--sidebar-w", `${w}px`);
  if (persist) {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
    } catch {}
  }
}

function resetSidebarWidth() {
  document.documentElement.style.removeProperty("--sidebar-w");
  try {
    localStorage.removeItem(SIDEBAR_WIDTH_KEY);
  } catch {}
}

/** Drag the sidebar's right edge to resize; double-click resets. Width persists in localStorage. */
function SidebarResizeHandle() {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const aside = e.currentTarget.parentElement!;
    const left = aside.getBoundingClientRect().left;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => setSidebarWidth(ev.clientX - left, false);
    const onUp = (ev: PointerEvent) => {
      setSidebarWidth(ev.clientX - left, true);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const current = e.currentTarget.parentElement!.getBoundingClientRect().width;
    setSidebarWidth(current + (e.key === "ArrowRight" ? 16 : -16), true);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={resetSidebarWidth}
      onKeyDown={onKeyDown}
      title="Drag to resize · double-click to reset"
      className="absolute inset-y-0 -right-1 z-10 hidden w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent after:transition-colors hover:after:bg-accent focus-visible:outline-none focus-visible:after:bg-accent xl:expanded:block"
    />
  );
}
