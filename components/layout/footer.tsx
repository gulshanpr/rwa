import Link from "next/link";
import { SITE } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-6 md:px-6">
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-small text-fg-muted">
          <Link href="/methodology#disclaimer" className="hover:text-fg">
            Disclaimer
          </Link>
          <Link href="/methodology" className="hover:text-fg">
            Methodology
          </Link>
          <a href={SITE.repoUrl} target="_blank" rel="noreferrer" className="hover:text-fg">
            GitHub
          </a>
          <a href="/api/assets" className="hover:text-fg">
            Open data (JSON)
          </a>
          <span className="text-fg-subtle" title="Publishing to X and Telegram starts with the alerts worker">
            X · Telegram (soon)
          </span>
        </nav>
        <p className="max-w-4xl text-label font-normal text-fg-subtle">{SITE.disclaimer}</p>
      </div>
    </footer>
  );
}
