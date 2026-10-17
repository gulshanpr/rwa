export function formatUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function formatUsdFull(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatPct(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits).replace(/\.0+$/, "")}%`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(iso)}, ${hh}:${mm} UTC`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days >= 2) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (days === 1) return `${24 + hours}h`;
  if (hours >= 1) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

export function formatDelay(seconds: number): string {
  if (seconds % 86400 === 0) {
    const d = seconds / 86400;
    return `${d}-day`;
  }
  return formatDuration(seconds);
}

/** A length of time as a noun: "2 days", "36h". */
export function formatSpan(seconds: number): string {
  if (seconds > 0 && seconds % 86400 === 0) {
    const d = seconds / 86400;
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  return formatDuration(seconds);
}

export function relativeTime(iso: string, now: number): string {
  const diff = (now - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(iso);
}

export function secondsBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000;
}
