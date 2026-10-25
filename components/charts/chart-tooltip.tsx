"use client";

import * as Tooltip from "@radix-ui/react-tooltip";

/** Hover card for chart marks and table cells. The child must accept a ref (a DOM element). */
export function ChartTooltip({ content, children }: { content: React.ReactNode; children: React.ReactElement }) {
  return (
    <Tooltip.Provider delayDuration={0} disableHoverableContent>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={6}
            collisionPadding={12}
            className="z-50 max-w-72 rounded-control border border-line bg-surface px-3 py-2.5 text-small text-fg shadow-popover"
          >
            {content}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
