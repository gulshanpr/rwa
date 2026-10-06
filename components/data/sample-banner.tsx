import { CircleAlert } from "lucide-react";
import Link from "next/link";

export function SampleBanner() {
  return (
    <div
      role="note"
      className="mb-5 flex items-start gap-2.5 rounded-control border border-accent/25 bg-accent-soft px-3.5 py-2.5 text-small text-fg"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
      <p>
        <strong className="font-semibold">Preview data.</strong> Permissions, oracle readings, DeFi markets and alerts
        on this page are illustrative seed data while the discovery pipeline and live worker are being built.
        Addresses other than the token contract are placeholders. Don&apos;t rely on them.{" "}
        <Link href="/methodology#data" className="text-accent underline underline-offset-2">
          How data gets here
        </Link>
      </p>
    </div>
  );
}
