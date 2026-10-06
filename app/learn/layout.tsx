import { DocsLayout } from "@/components/docs/docs-layout";

export default function Layout({ children }: LayoutProps<"/learn">) {
  return <DocsLayout>{children}</DocsLayout>;
}
