import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    // Exclude auth routes entirely — never cache, always hit network
    // This prevents OAuth redirect loops caused by stale session cache
    runtimeCaching: [
      {
        urlPattern: /^\/api\/auth\/.*/i,
        handler: "NetworkOnly" as const,
      },
    ],
  },
});

const nextConfig: NextConfig = {
  turbopack: {},
  // Ensure large data files are included in Vercel serverless bundles
  outputFileTracingIncludes: {
    '/api/slope-scanner': ['./data/**/*'],
    '/api/tw-slope': ['./data/**/*'],
  },
};

export default withPWA(nextConfig);
