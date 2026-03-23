import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable instrumentation hook for background Satis GPS polling
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
