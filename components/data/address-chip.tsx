"use client";

import { Check, Clock, Copy, ExternalLink, FileCode2, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { explorerAddress } from "@/lib/chains";
import { shortAddress } from "@/lib/format";
import type { Chain } from "@/lib/schema/asset";
import { cn } from "@/lib/ui";

export type AddressKind = "eoa" | "signer" | "safe" | "timelock" | "proxy-admin" | "contract" | "contract-unknown";

const ICONS: Record<AddressKind, typeof KeyRound> = {
  eoa: KeyRound,
  signer: KeyRound,
  safe: Lock,
  timelock: Clock,
  "proxy-admin": ShieldCheck,
  contract: FileCode2,
  "contract-unknown": FileCode2,
};

const KIND_LABEL: Record<AddressKind, string> = {
  eoa: "Single key (EOA)",
  signer: "Safe signer",
  safe: "Safe multisig",
  timelock: "Timelock",
  "proxy-admin": "ProxyAdmin",
  contract: "Contract",
  "contract-unknown": "Unrecognized contract",
};

export function AddressChip({
  address,
  chain = "ethereum",
  kind = "contract",
  label,
  detail,
  className,
}: {
  address: string;
  chain?: Chain;
  kind?: AddressKind;
  label?: string;
  detail?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const Icon = ICONS[kind];

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-control border border-line bg-surface py-0.5 pr-1 pl-1.5 align-middle",
        className,
      )}
    >
      <Icon
        aria-label={KIND_LABEL[kind]}
        className={cn("size-3.5 shrink-0", kind === "eoa" ? "text-risk-red" : "text-fg-muted")}
      />
      {label && <span className="truncate text-small text-fg">{label}</span>}
      {detail && <span className="truncate text-label text-fg-muted">{detail}</span>}
      <span title={address} className="shrink-0 font-mono text-[12px] whitespace-nowrap text-fg-muted">
        {shortAddress(address)}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy address"}
        className="shrink-0 rounded p-0.5 text-fg-subtle hover:bg-subtle hover:text-fg"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
      <a
        href={explorerAddress(chain, address)}
        target="_blank"
        rel="noreferrer"
        aria-label="Open in block explorer"
        className="shrink-0 rounded p-0.5 text-fg-subtle hover:bg-subtle hover:text-fg"
      >
        <ExternalLink className="size-3" />
      </a>
    </span>
  );
}
