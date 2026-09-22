import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Pin the Turbopack root to this app so a parent lockfile cannot take over.
  turbopack: {
    root: path.resolve("."),
  },
};

export default nextConfig;
