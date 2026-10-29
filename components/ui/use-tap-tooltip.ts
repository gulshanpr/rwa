"use client";

import { useRef, useState } from "react";

/**
 * Radix tooltips open on hover and keyboard focus only, so on touch screens they never show.
 * Spread these onto Tooltip.Root and Tooltip.Trigger to make a tap toggle the tooltip; mouse and keyboard are unchanged.
 */
export function useTapTooltip() {
  const [open, setOpen] = useState(false);
  const touch = useRef(false);
  // Radix closes an open tooltip on pointerdown, before the click, so the toggle reads the state from then.
  const wasOpen = useRef(false);

  return {
    root: { open, onOpenChange: setOpen },
    trigger: {
      onPointerDown: (e: React.PointerEvent) => {
        touch.current = e.pointerType !== "mouse";
        wasOpen.current = open;
      },
      onClick: (e: React.MouseEvent) => {
        if (!touch.current) return;
        // Skips Radix's close-on-click.
        e.preventDefault();
        setOpen(!wasOpen.current);
      },
    },
  };
}
