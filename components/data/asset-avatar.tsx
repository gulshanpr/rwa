import Link from "next/link";
import { cn } from "@/lib/ui";

/** Deep hues only, so an avatar never reads as a risk color (no red, green or amber). */
const HUES = ["#3B3BD9", "#2E6BE6", "#7A5AF8", "#0E7490", "#C11574", "#6D28D9", "#344054", "#0369A1"];

function hueFor(slug: string): string {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

const SIZES = {
  sm: "size-7 rounded-[8px] text-[11px]",
  md: "size-9 rounded-[10px] text-[13px]",
  lg: "size-12 rounded-[14px] text-[15px] md:size-14 md:text-[17px]",
};

/** Monogram tile standing in for an asset logo. */
export function AssetAvatar({ slug, ticker, size = "sm" }: { slug: string; ticker: string; size?: keyof typeof SIZES }) {
  const letters = ticker.replace(/^[A-Z]{1,3}_/, "").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center font-semibold tracking-tight text-white", SIZES[size])}
      style={{ background: hueFor(slug) }}
    >
      {letters}
    </span>
  );
}

/** Avatar, ticker and full name on one compact two-line cell. */
export function AssetCell({ slug, ticker, name }: { slug: string; ticker: string; name: string }) {
  return (
    <Link href={`/assets/${slug}`} className="group flex min-w-0 items-center gap-2.5">
      <AssetAvatar slug={slug} ticker={ticker} />
      <span className="min-w-0">
        <span className="block truncate text-small font-semibold text-fg group-hover:text-accent">{ticker}</span>
        <span className="block max-w-64 truncate text-label font-normal text-fg-muted" title={name}>
          {name}
        </span>
      </span>
    </Link>
  );
}
