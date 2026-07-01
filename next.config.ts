import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The service worker script itself must never be long-cached by the
  // browser, or updates to its caching logic would never reach devices.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
