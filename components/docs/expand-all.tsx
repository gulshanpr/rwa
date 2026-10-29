"use client";

import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";

/** Intro line for a run of folded sections, with a button that opens or closes all of them. */
export function ExpandAll({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = () => {
    const all = [...document.querySelectorAll<HTMLDetailsElement>("article.prose details")];
    const next = all.some((d) => !d.open);
    all.forEach((d) => (d.open = next));
    setOpen(next);
  };
  return (
    <div className="my-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="m-0! text-fg-muted">{children}</p>
      <button
        type="button"
        onClick={toggle}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-small text-fg-muted hover:border-line-strong hover:text-fg"
      >
        <ChevronsUpDown className="size-3.5" aria-hidden />
        {open ? "Collapse all" : "Expand all"}
      </button>
    </div>
  );
}
