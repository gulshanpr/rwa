"use client";

import { useSyncExternalStore } from "react";
import { formatDate, formatDateTime, relativeTime } from "@/lib/format";

const subscribe = (cb: () => void) => {
  const id = setInterval(cb, 60_000);
  return () => clearInterval(id);
};
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;

/** Server renders the absolute date; the client swaps in "2h ago" after hydration. */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const now = useSyncExternalStore(subscribe, minuteNow, () => 0);
  return (
    <time dateTime={iso} title={formatDateTime(iso)} className={className}>
      {now ? relativeTime(iso, now) : formatDate(iso)}
    </time>
  );
}
