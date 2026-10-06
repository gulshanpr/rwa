import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { Callout } from "@/components/docs/callout";

function text(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (node && typeof node === "object" && "props" in node) {
    return text((node as { props: { children?: React.ReactNode } }).props.children);
  }
  return "";
}

export function slugify(node: React.ReactNode): string {
  return text(node)
    .toLowerCase()
    .replace(/&/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const components: MDXComponents = {
  h2: ({ children }) => <h2 id={slugify(children)}>{children}</h2>,
  h3: ({ children }) => <h3 id={slugify(children)}>{children}</h3>,
  a: ({ href = "", children }) =>
    href.startsWith("/") || href.startsWith("#") ? (
      <Link href={href}>{children}</Link>
    ) : (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
  Callout,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
