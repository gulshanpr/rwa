"use client";

import { useEffect } from "react";

// Back/forward should keep the position the browser restores, so remember how the last navigation happened.
let traversed = false;
if (typeof window !== "undefined" && "navigation" in window) {
  (window.navigation as EventTarget).addEventListener("navigate", (e) => {
    traversed = (e as Event & { navigationType: string }).navigationType === "traverse";
  });
}

/**
 * Next.js scrolls a new page into view, which for an asset is the tab content below the header.
 * Opening an asset starts at its header instead. Tab switches keep the layout mounted, so they don't trigger this.
 */
export function ScrollToTop({ slug }: { slug: string }) {
  useEffect(() => {
    if (traversed || window.location.hash) return;
    window.scrollTo(0, 0);
  }, [slug]);
  return null;
}
