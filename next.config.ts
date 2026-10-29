import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  pageExtensions: ["ts", "tsx", "mdx"],
  outputFileTracingIncludes: {
    "/*": ["./data/**/*", "./discovered/**/*"],
  },
  // Tabs from the six-slice rosette, renamed in framework v1.0.
  redirects() {
    return [
      { source: "/assets/:slug/verification", destination: "/assets/:slug/transparency", permanent: true },
      { source: "/assets/:slug/disclosure", destination: "/assets/:slug/counterparties", permanent: true },
      // Asset-class pages folded into the screener's class filter.
      { source: "/asset-classes/:class", destination: "/screener?class=:class", permanent: true },
    ];
  },
};

const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
  },
});

export default withMDX(nextConfig);
