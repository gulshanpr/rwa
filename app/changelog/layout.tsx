import { DocsLayout } from "@/components/docs/docs-layout";

export default function Layout({ children }: LayoutProps<"/changelog">) {
  return <DocsLayout>{children}</DocsLayout>;
}
