import type { NextConfig } from "next";

// Cache Components is intentionally disabled: every DHOS route is tenant- and
// user-scoped, and server-side `use cache` entries keyed incorrectly would leak
// data across tenants. See docs/DECISIONS/ADR-0003-rendering-and-caching.md.
const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
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
