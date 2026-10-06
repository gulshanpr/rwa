"use client";

import * as Popover from "@radix-ui/react-popover";
import { ExternalLink } from "lucide-react";
import { useRef, useState } from "react";
import { formatDate } from "@/lib/format";
import type { Source } from "@/lib/schema/sourced";
import { explorerTx } from "@/lib/chains";
import type { Chain } from "@/lib/schema/asset";

export function SourceMarker({ source, chain = "ethereum" }: { source: Source; chain?: Chain }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const href = source.url ?? (source.tx ? explorerTx(chain, source.tx) : undefined);

  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onMouseEnter={show}
          onMouseLeave={hide}
          aria-label="Show source"
          className="ml-1 inline-flex align-super font-mono text-[10px] leading-none text-fg-subtle hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          [src]
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={6}
          onMouseEnter={show}
          onMouseLeave={hide}
          className="z-50 w-72 rounded-control border border-line bg-surface p-3 text-small shadow-popover"
        >
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-1.5 break-all text-accent hover:underline"
            >
              <span className="min-w-0">{source.url ?? source.tx}</span>
              <ExternalLink className="mt-0.5 size-3.5 shrink-0" />
            </a>
          )}
          {source.note && <p className="mt-1.5 text-fg-muted">{source.note}</p>}
          <p className="mt-1.5 text-label text-fg-subtle">Checked {formatDate(source.checkedAt)}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
