"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui";
import { NAV } from "./nav";

export type SidebarVariant = "full" | "rail" | "responsive";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ variant, onNavigate }: { variant: SidebarVariant; onNavigate?: () => void }) {
  const pathname = usePathname();
  const labelClass = variant === "full" ? "" : variant === "rail" ? "sr-only" : "sr-only xl:expanded:not-sr-only";
  const headingClass = variant === "full" ? "block" : variant === "rail" ? "hidden" : "hidden xl:expanded:block";
  const itemLayout =
    variant === "full" ? "px-2.5" : variant === "rail" ? "justify-center px-0" : "justify-center px-0 xl:expanded:justify-start xl:expanded:px-2.5";

  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {NAV.map((group) => (
        <div key={group.heading}>
          <p className={cn("mb-1.5 px-2.5 text-micro text-fg-subtle uppercase", headingClass)}>{group.heading}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    title={item.label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-8 items-center gap-2.5 rounded-control text-body",
                      itemLayout,
                      active ? "bg-accent-soft font-medium text-accent" : "text-fg-muted hover:bg-subtle hover:text-fg",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className={cn("flex-1 truncate", labelClass)}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
