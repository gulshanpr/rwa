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
  // PostHog proxied through our own domain; the path matches api_host in instrumentation-client.ts.
  // A neutral name, since blockers match paths like /analytics or /posthog.
  rewrites() {
    return [
      { source: "/rbx/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/rbx/array/:path*", destination: "https://us-assets.i.posthog.com/array/:path*" },
      { source: "/rbx/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
  // PostHog endpoints end in a slash (/e/, /flags/); without this each request takes a 308 first.
  skipTrailingSlashRedirect: true,
};

const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
  },
});

export default withMDX(nextConfig);
