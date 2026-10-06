import { DocsLayout } from "@/components/docs/docs-layout";

export default function Layout({ children }: LayoutProps<"/methodology">) {
  return <DocsLayout>{children}</DocsLayout>;
}
