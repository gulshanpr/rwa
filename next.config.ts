import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  pageExtensions: ["ts", "tsx", "mdx"],
  outputFileTracingIncludes: {
    "/*": ["./data/**/*", "./discovered/**/*"],
  },
};

const withMDX = createMDX({});

export default withMDX(nextConfig);
