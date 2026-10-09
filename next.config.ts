import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {
    // Set project root to prevent scanning parent directories
    root: __dirname,
  },
};

export default nextConfig;
