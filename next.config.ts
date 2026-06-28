import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    // Exclude auth/session/admin routes — never cache, always hit network
    // This prevents OAuth redirect loops caused by stale session cache
    runtimeCaching: [
      {
        // All NextAuth routes: session, callback, signin, signout
        urlPattern: /^\/api\/auth\/.*/i,
        handler: "NetworkOnly" as const,
      },
      {
        // Admin whoami must always hit network (never serve stale auth state)
        urlPattern: /^\/api\/admin\/whoami/i,
        handler: "NetworkOnly" as const,
      },
      {
        // Login page must never be served from cache
        urlPattern: /^\/login/i,
        handler: "NetworkOnly" as const,
      },
      {
        // Experts page must never be served from cache (auth-gated)
        urlPattern: /^\/experts/i,
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
