"use client";

import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/ui";

/** Classes that keep a popover on screen: at least as wide as its trigger, never wider or taller than the viewport allows. */
export const POPOVER_BOUNDS =
  "max-h-[min(20rem,var(--radix-popover-content-available-height))] max-w-[calc(100vw-2rem)] min-w-(--radix-popover-trigger-width)";

/**
 * Single-choice dropdown. A native <select> opens as an OS menu laid over the control (on macOS it jumps to
 * line the current option up with the trigger), so this always opens below the trigger and stays on screen.
 */
export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  /** Accessible name; the trigger shows the current option. */
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=option]")];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`${label}: ${current?.label ?? ""}`}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-small whitespace-nowrap text-fg-muted hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        {current?.label}
        <ChevronDown className="size-3.5" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={16}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            listRef.current?.querySelector<HTMLElement>("[aria-selected=true]")?.focus();
          }}
          className={cn("z-50 flex flex-col rounded-control border border-line bg-surface shadow-popover", POPOVER_BOUNDS)}
        >
          <div ref={listRef} role="listbox" aria-label={label} onKeyDown={onKeyDown} className="overflow-y-auto p-1.5">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-small text-fg hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none"
              >
                {o.label}
                <Check className={cn("size-3.5 shrink-0 text-accent", o.value !== value && "invisible")} aria-hidden />
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
