import { getDb, schema } from "@/db/client";
import type { Alert } from "@/lib/schema/live";
import { log } from "./util";

const SITE_URL = process.env.SITE_URL ?? "";

type NewAlert = Omit<Alert, "publishedAt"> & { publishedAt?: string; eventId?: number };

// Returns true if the alert is new. Alert ids are deterministic, so re-runs never duplicate.
// notify: false stores it without Telegram or a discovery run (backfilled history, not news).
export async function raiseAlert(a: NewAlert, { notify = true } = {}): Promise<boolean> {
  const inserted = await getDb()
    .insert(schema.alert)
    .values({
      id: a.id,
      assetSlug: a.asset,
      severity: a.severity,
      kind: a.kind,
      title: a.title,
      bodyMd: a.consequence,
      eventId: a.eventId,
      chain: a.chain,
      contract: a.contract,
      txHash: a.txHash,
      block: a.block,
      url: a.url,
      publishedAt: a.publishedAt ? new Date(a.publishedAt) : new Date(),
      channelsJson: [],
    })
    .onConflictDoNothing()
    .returning({ id: schema.alert.id });
  if (inserted.length === 0) return false;

  log("alert", `${a.severity} ${a.asset}: ${a.title}`);
  if (!notify) return true;
  await Promise.all([publishTelegram(a), dispatchDiscovery(a.asset)]);
  return true;
}

async function publishTelegram(a: NewAlert) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  const text = `[${a.severity.toUpperCase()}] ${a.title}\n${a.consequence}\n${SITE_URL}/assets/${a.asset}/history`;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  });
  if (!res.ok) log("telegram", `send failed: ${res.status}`);
}

// Re-runs discovery so the risk page reflects the change (spec 8.2).
async function dispatchDiscovery(asset: string) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return;
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/discover.yml/dispatches`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
    body: JSON.stringify({ ref: process.env.GITHUB_REF_NAME ?? "main", inputs: { asset } }),
  });
  if (!res.ok) log("github", `discovery dispatch failed: ${res.status}`);
}
