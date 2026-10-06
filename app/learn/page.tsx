import Link from "next/link";
import { DOCS_NAV } from "@/components/docs/docs-layout";

export const metadata = { title: "Learn" };

const BLURBS: Record<string, string> = {
  "/learn/eoa": "A wallet controlled by one private key. The riskiest kind of admin.",
  "/learn/multisig": "A wallet that needs several signers to approve each action.",
  "/learn/timelock": "A contract that forces a waiting period before changes take effect.",
  "/learn/proxy-upgrade": "How a token's code can be replaced without changing its address.",
  "/learn/nav-oracle": "How a fund's net asset value gets onchain, and why freshness matters.",
  "/learn/spv": "The legal wrapper that usually holds the real-world assets.",
};

export default function LearnIndex() {
  const entries = DOCS_NAV.find((s) => s.heading === "Learn")?.items.filter((i) => i.href !== "/learn") ?? [];
  return (
    <>
      <h1>Learn</h1>
      <p>
        Short explainers for the terms used across RWABeat. Each one says what the thing is in plain English and why
        risk curators care about it.
      </p>
      <ul className="!list-none !pl-0">
        {entries.map((e) => (
          <li key={e.href} className="!my-0 border-b border-line py-3 last:border-0">
            <Link href={e.href} className="font-medium !no-underline">
              {e.label}
            </Link>
            <p className="!mb-0 text-[14px] text-fg-muted">{BLURBS[e.href]}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
