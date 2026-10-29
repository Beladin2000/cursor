import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Bound to 0.0.0.0, Next only allows the hostname "localhost" unless listed here.
  // 127.0.0.1 is a different origin, and a blocked HMR socket leaves the page unhydrated.
  allowedDevOrigins: ["127.0.0.1", "cursor"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
