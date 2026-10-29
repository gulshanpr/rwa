"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/ui";

interface Heading {
  id: string;
  text: string;
  level: number;
}

export function OnThisPage() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<string>();

  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("article.prose h2[id], article.prose h3[id]")];
    setHeadings(els.map((el) => ({ id: el.id, text: el.textContent ?? "", level: el.tagName === "H2" ? 2 : 3 })));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Ignore headings hidden under the pinned top bar.
      {
        rootMargin: `-${parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) + 16 || 80}px 0px -70% 0px`,
      },
    );
    els.forEach((el) => observer.observe(el));

    // A link to a heading inside a folded section opens it first (not every browser does this itself).
    const reveal = () => {
      const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      const details = target?.closest("details");
      if (!target || !details || details.open) return;
      details.open = true;
      target.scrollIntoView();
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", reveal);
    };
  }, [pathname]);

  if (headings.length < 2) return null;
  return (
    <nav aria-label="On this page" className="sticky top-[calc(var(--topbar-h)+2rem)]">
      <p className="mb-2 text-micro text-fg-subtle uppercase">On this page</p>
      <ul className="space-y-1 border-l border-line text-small">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={cn(
                "-ml-px block border-l py-0.5 hover:text-fg",
                h.level === 3 ? "pl-6" : "pl-3",
                active === h.id ? "border-accent text-accent" : "border-transparent text-fg-muted",
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
