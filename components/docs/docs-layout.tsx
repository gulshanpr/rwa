import { DocsNav } from "./docs-nav";
import { OnThisPage } from "./on-this-page";

const DOCS_NAV = [
  {
    heading: "Framework",
    items: [
      { label: "Methodology", href: "/methodology" },
      { label: "Changelog", href: "/changelog" },
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
