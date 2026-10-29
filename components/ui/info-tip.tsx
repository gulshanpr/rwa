"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import Link from "next/link";
import { useTapTooltip } from "./use-tap-tooltip";

export function InfoTip({ children, href, label }: { children: React.ReactNode; href?: string; label: string }) {
  const tap = useTapTooltip();
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root {...tap.root}>
        <Tooltip.Trigger asChild {...tap.trigger}>
          <button
            type="button"
            aria-label={`About ${label}`}
            className="inline-flex text-fg-subtle hover:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Info className="size-3.5" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={6}
            collisionPadding={12}
            className="z-50 max-w-64 rounded-control border border-line bg-surface px-3 py-2 text-small text-fg-muted shadow-popover"
          >
            {children}
            {href && (
              <Link href={href} className="mt-1 block text-accent hover:underline">
                Methodology →
              </Link>
            )}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
