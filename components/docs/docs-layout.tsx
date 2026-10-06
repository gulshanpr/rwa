import { DocsNav } from "./docs-nav";
import { OnThisPage } from "./on-this-page";

export const DOCS_NAV = [
  {
    heading: "Framework",
    items: [
      { label: "Methodology", href: "/methodology" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    heading: "Learn",
    items: [
      { label: "Glossary", href: "/learn" },
      { label: "What is an EOA?", href: "/learn/eoa" },
      { label: "What is a multisig?", href: "/learn/multisig" },
      { label: "What is a timelock?", href: "/learn/timelock" },
      { label: "What is a proxy upgrade?", href: "/learn/proxy-upgrade" },
      { label: "What is a NAV oracle?", href: "/learn/nav-oracle" },
      { label: "What is an SPV?", href: "/learn/spv" },
    ],
  },
];

export function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_200px]">
      <aside className="hidden lg:block">
        <DocsNav sections={DOCS_NAV} />
      </aside>
      <article className="prose min-w-0 rounded-card border border-line bg-surface px-5 py-6 shadow-card md:px-10 md:py-9">
        {children}
      </article>
      <aside className="hidden xl:block">
        <OnThisPage />
      </aside>
    </div>
  );
}
